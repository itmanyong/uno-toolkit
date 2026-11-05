// Round 06 · S12 判定口径 + 常数拟合：granularity 三档 × m∈{8,32,128}
// 每配置独立加载页面（保证 configureTxn 干净生效）。
// 端到端延迟口径：write → MessageChannel 宏任务轮询直到 m 个块全部显示新值（≈0.1ms 分辨率）。
// Node 侧最小二乘拟合：T(m) ≈ c_b·m + t_r。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");

const GRANULARITIES = ["fine", "balanced", "coarse"];
const SIZES = [8, 32, 128];
const ROUNDS = 20;

const matrix = {};
for (const g of GRANULARITIES) {
  for (const m of SIZES) {
    const scenario = `s12-${g}-${m}`;
    await page.goto(`http://localhost:4173/?r=${scenario}-${Date.now()}#${scenario}`, { timeout: 20000 });
    await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

    matrix[scenario] = await page.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const drain = () => new Promise((r) => queueMicrotask(r));
      // 宏任务让渡（MessageChannel），粒度约 0.1ms，用于高分辨率 commit 等待
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
      const m = ${m};
      const ROUNDS = ${ROUNDS};

      const waitAllUpdated = async (v, timeout = 3000) => {
        const t0 = performance.now();
        while (b.api.getUpdatedCount(v) !== m) {
          if (performance.now() - t0 > timeout) throw new Error("waitAllUpdated timeout");
          await yieldMacrotask();
        }
        return performance.now() - t0;
      };

      // 预热：10 次写入 + 排空 + 30ms 落定
      for (let i = 0; i < 10; i++) { b.api.write(i); await drain(); }
      await sleep(30);
      await waitAllUpdated(9);

      const latencies = [];
      const flushCosts = [];
      const moPerRound = [];
      let t0;
      for (let r = 0; r < ROUNDS; r++) {
        const v = 700000 + r;
        b.resetCounters();
        t0 = performance.now();
        b.api.write(v);
        await drain();
        flushCosts.push(performance.now() - t0);
        await waitAllUpdated(v);
        latencies.push(performance.now() - t0);
        moPerRound.push(b.moTypesSnapshot.length);
      }
      const last = 700000 + ROUNDS - 1;
      return {
        rounds: ROUNDS,
        e2e: stats(latencies),
        flushToMicrotask: stats(flushCosts),
        moPerRound,
        updatedCount: b.api.getUpdatedCount(last),
        domWritesTotal: b.domWrites,
      };
    })()`);

    console.log("=== " + scenario + " ===");
    console.log(JSON.stringify(matrix[scenario], null, 2));
  }
}

// ---- 最小二乘拟合：T(m) = c_b·m + t_r ----
function fitLinear(points) {
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  const ssTot = points.reduce((a, p) => a + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}

const fits = {};
for (const g of GRANULARITIES) {
  const points = SIZES.map((m) => ({
    x: m,
    y: matrix[`s12-${g}-${m}`].e2e.mean,
  }));
  const fit = fitLinear(points);
  fits[g] = {
    points,
    c_b_msPerBlock: fit.slope,
    t_r_ms: fit.intercept,
    r2: fit.r2,
  };
}
console.log("=== least squares fit: T(m) = c_b*m + t_r ===");
console.log(JSON.stringify(fits, null, 2));
