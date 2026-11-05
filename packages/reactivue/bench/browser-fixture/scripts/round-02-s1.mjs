// Round 02 · S1 判定口径：文本通道 TextBinding
// Round A：同 task 1000 次异值写（合并行为） / Round B：同值写（值级抑制） / Round C：单写 100 轮延迟分布
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto(`http://localhost:4173/?r=s1-${Date.now()}#s1`, { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

const result = await page.evaluate(`(async () => {
  const drain = () => new Promise((r) => queueMicrotask(r));
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

  // 预热：10 次写入并排空
  for (let i = 0; i < 10; i++) { b.api.write(i); await drain(); }
  await sleep(30);

  // Round A：同 task 1000 次异值连续写
  b.resetCounters();
  let t0 = performance.now();
  for (let i = 1; i <= 1000; i++) b.api.write(i);
  const tSchedA = performance.now() - t0;
  await drain();
  const roundA = {
    scheduleMs: tSchedA,
    amortizedUsPerWrite: (tSchedA / 1000) * 1000,
    e2eMs: performance.now() - t0,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
    commits: b.commitCount,
    finalText: b.api.getText(),
  };

  // Round B：同 task 1000 次同值写（预置 42 后写同值）
  b.api.write(42);
  await drain();
  b.resetCounters();
  t0 = performance.now();
  for (let i = 0; i < 1000; i++) b.api.write(42);
  const tSchedB = performance.now() - t0;
  await drain();
  const roundB = {
    scheduleMs: tSchedB,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
    commits: b.commitCount,
  };

  // Round C：单写 100 轮（每轮异值 + 微任务排空）
  b.resetCounters();
  const latencies = [];
  const schedCosts = [];
  for (let r = 0; r < 100; r++) {
    const v = 100000 + r;
    t0 = performance.now();
    b.api.write(v);
    schedCosts.push(performance.now() - t0);
    await drain();
    latencies.push(performance.now() - t0);
  }
  const roundC = {
    latency: stats(latencies),
    schedule: stats(schedCosts),
    domWritesTotal: b.domWrites,
    commitsTotal: b.commitCount,
    finalText: b.api.getText(),
  };

  return { scenario: b.scenario, roundA, roundB, roundC };
})()`);

console.log(JSON.stringify(result, null, 2));
