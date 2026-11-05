// Round 04 · S3 判定口径：m∈{8,32,128} 扇出（文本通道 TextBinding / 结构通道 Block）
// 每配置独立加载页面；20 轮单写采样端到端延迟 + 计数器。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");

const SCENARIOS = [
  "s3-text-8", "s3-text-32", "s3-text-128",
  "s3-block-8", "s3-block-32", "s3-block-128",
];

const all = {};
for (const scenario of SCENARIOS) {
  await page.goto(`http://localhost:4173/?r=${scenario}-${Date.now()}#${scenario}`, { timeout: 20000 });
  await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

  all[scenario] = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stats = (a) => {
      const s = [...a].sort((x, y) => x - y);
      const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
      return {
        n: a.length,
        mean: a.reduce((x, y) => x + y, 0) / a.length,
        p50: q(50),
        p95: q(95),
        max: s[s.length - 1],
      };
    };
    const b = window.__bench;
    const isText = b.scenario.indexOf("s3-text") === 0;
    const ROUNDS = 20;

    if (isText) {
      // 文本通道：预热 10 次（微任务排空即落地）
      const drain = () => new Promise((r) => queueMicrotask(r));
      for (let i = 0; i < 10; i++) { b.api.write(i); await drain(); }
      await sleep(20);
      b.resetCounters();
      const latencies = [];
      let t0;
      for (let r = 0; r < ROUNDS; r++) {
        const v = 500000 + r;
        t0 = performance.now();
        b.api.write(v);
        await drain();
        latencies.push(performance.now() - t0);
      }
      const last = 500000 + ROUNDS - 1;
      return {
        rounds: ROUNDS,
        latency: stats(latencies),
        domWritesTotal: b.domWrites,
        moRecordsTotal: b.moTypesSnapshot.length,
        finalTextHasLast: b.api.getText().includes("#" + last) || b.api.getText().indexOf(String(last)) >= 0,
        finalText: b.api.getText().slice(0, 80),
      };
    }

    // 结构通道：预热 10 次（等待 commit）
    const yieldMacrotask = () => new Promise((r) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); r(); };
        ch.port2.postMessage(0);
      });
    const waitForText = async (needle, timeout = 5000) => {
      const t0 = performance.now();
      while (!b.api.getText().includes(needle)) {
        if (performance.now() - t0 > timeout) throw new Error("waitForText timeout: " + needle);
        await yieldMacrotask();
      }
      return performance.now() - t0;
    };
    for (let i = 0; i < 10; i++) {
      b.api.write(i);
      await waitForText("#" + i);
    }
    b.resetCounters();
    const renderBefore = b.api.getRenderCount();
    const latencies = [];
    let t0;
    for (let r = 0; r < ROUNDS; r++) {
      const v = 600000 + r;
      t0 = performance.now();
      b.api.write(v);
      await waitForText("#" + v);
      latencies.push(performance.now() - t0);
    }
    const last = 600000 + ROUNDS - 1;
    return {
      rounds: ROUNDS,
      latency: stats(latencies),
      renderDelta: b.api.getRenderCount() - renderBefore,
      domWritesTotal: b.domWrites,
      moRecordsTotal: b.moTypesSnapshot.length,
      updatedCount: b.api.getUpdatedCount(last),
    };
  })()`);

  console.log("=== " + scenario + " ===");
  console.log(JSON.stringify(all[scenario], null, 2));
}
