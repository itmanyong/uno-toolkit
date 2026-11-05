// Round 03 · S2 判定口径：结构通道（Block）vs useState 基线（复杂表达式）
// 等待 commit 使用 MessageChannel 宏任务轮询（避免 setTimeout 嵌套 4ms 钳制污染延迟）。
// Round A：同 task 1000 次异值写 → 等待 React commit 后采样
// Round C：单写 100 轮（每轮等待 DOM commit）→ 端到端延迟分布
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");

const SCENARIOS = ["s2-block", "s2-state"];

for (const scenario of SCENARIOS) {
  await page.goto(`http://localhost:4173/?r=${scenario}-${Date.now()}#${scenario}`, { timeout: 20000 });
  await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

  const result = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const yieldMacrotask = () => new Promise((r) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); r(); };
      ch.port2.postMessage(0);
    });
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
    const waitForText = async (needle, timeout = 5000) => {
      const t0 = performance.now();
      while (!b.api.getText().includes(needle)) {
        if (performance.now() - t0 > timeout) throw new Error("waitForText timeout: " + needle);
        await yieldMacrotask();
      }
      return performance.now() - t0;
    };

    // 预热：10 次写入，每次等待 commit
    for (let i = 0; i < 10; i++) {
      b.api.write(i);
      await waitForText("#" + i);
    }

    // Round A：同 task 1000 次异值连续写
    const renderBefore = b.api.getRenderCount ? b.api.getRenderCount() : 0;
    b.resetCounters();
    let t0 = performance.now();
    for (let i = 1; i <= 1000; i++) b.api.write(i);
    const writeLoopMs = performance.now() - t0;
    const commitWait = await waitForText("#1000");
    const roundA = {
      writeLoopMs,
      e2eMs: performance.now() - t0,
      commitWaitMs: commitWait,
      renderClosureDelta: b.api.getRenderCount ? b.api.getRenderCount() - renderBefore : null,
      domWrites: b.domWrites,
      moRecords: b.moTypesSnapshot.length,
    };

    // Round C：单写 100 轮（每轮异值 + 等待 commit）
    b.resetCounters();
    const renderBeforeC = b.api.getRenderCount ? b.api.getRenderCount() : 0;
    const latencies = [];
    for (let r = 0; r < 100; r++) {
      const v = 200000 + r;
      t0 = performance.now();
      b.api.write(v);
      await waitForText("#" + v);
      latencies.push(performance.now() - t0);
    }
    const roundC = {
      latency: stats(latencies),
      renderTotal: b.api.getRenderCount ? b.api.getRenderCount() - renderBeforeC : null,
      domWritesTotal: b.domWrites,
      moRecordsTotal: b.moTypesSnapshot.length,
    };

    return { scenario: b.scenario, roundA, roundC };
  })()`);

  console.log("=== " + scenario + " ===");
  console.log(JSON.stringify(result, null, 2));
}
