// Round 07 · S11 restart 观测：startTransition 高频写入下结构块最终一致性与延迟
// m=32 结构块；Round A：单个 transition 内 50 次连续写；Round B：30 轮单写 transition。
// 注：restart 精确计数无法从页面口径获取，用「全部块到达最终值的端到端延迟 + DOM 写次数」代替。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto(`http://localhost:4173/?r=s11-${Date.now()}#s11`, { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

const result = await page.evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const drain = () => new Promise((r) => queueMicrotask(r));
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
  const M = 32;

  const waitAllUpdated = async (v, timeout = 5000) => {
    const t0 = performance.now();
    while (b.api.getUpdatedCount(v) !== M) {
      if (performance.now() - t0 > timeout) throw new Error("waitAllUpdated timeout: " + v);
      await yieldMacrotask();
    }
    return performance.now() - t0;
  };

  // 预热（非 transition 直写）
  for (let i = 0; i < 10; i++) { b.api.write(i); await drain(); }
  await sleep(30);
  await waitAllUpdated(9);

  // Round A：单个 startTransition 调用栈内 50 次连续写 → 最终一致性
  b.resetCounters();
  let t0 = performance.now();
  for (let i = 1; i <= 50; i++) b.api.writeTransition(5000 + i);
  const scheduleMs = performance.now() - t0;
  const settleMs = await waitAllUpdated(5050);
  const roundA = {
    scheduleMs,
    e2eMs: performance.now() - t0,
    settleWaitMs: settleMs,
    updatedCount: b.api.getUpdatedCount(5050),
    intermediateValue5040Visible: b.api.getUpdatedCount(5040),
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };

  // Round B：30 轮单写 transition（每轮异值，等待全部块更新）
  b.resetCounters();
  const latencies = [];
  for (let r = 0; r < 30; r++) {
    const v = 600000 + r;
    t0 = performance.now();
    b.api.writeTransition(v);
    await waitAllUpdated(v);
    latencies.push(performance.now() - t0);
  }
  const roundB = {
    latency: stats(latencies),
    domWritesTotal: b.domWrites,
    moRecordsTotal: b.moTypesSnapshot.length,
  };

  // Round C：高频连发 transition（每轮一个 transition，中间不等待）→ 最终一致性与总延迟
  b.resetCounters();
  t0 = performance.now();
  for (let i = 0; i < 50; i++) b.api.writeTransition(700000 + i);
  const scheduleC = performance.now() - t0;
  const settleC = await waitAllUpdated(700049);
  const roundC = {
    scheduleMs: scheduleC,
    e2eMs: performance.now() - t0,
    updatedCount: b.api.getUpdatedCount(700049),
    intermediateValue700000Visible: b.api.getUpdatedCount(700000),
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };

  return { scenario: b.scenario, roundA, roundB, roundC };
})()`);

console.log(JSON.stringify(result, null, 2));
