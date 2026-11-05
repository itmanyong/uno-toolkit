// Round 03b · 诊断：s2-block Round A 期间 render 闭包计数的细粒度采样
// 目的：定位 1002 次渲染闭包执行发生在写循环内（每写一次渲染一次）
// 还是等待窗口内；同时采样 MO 记录到达时机。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto(`http://localhost:4173/?r=s2b-diag-${Date.now()}#s2-block`, { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

const result = await page.evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const b = window.__bench;
  const waitForText = async (needle, timeout = 5000) => {
    const t0 = performance.now();
    while (!b.api.getText().includes(needle)) {
      if (performance.now() - t0 > timeout) throw new Error("waitForText timeout");
      await sleep(1);
    }
    return performance.now() - t0;
  };

  for (let i = 0; i < 10; i++) {
    b.api.write(i);
    await waitForText("#" + i);
  }

  const rc = () => b.api.getRenderCount();
  b.resetCounters();
  const before = rc();
  let t0 = performance.now();
  for (let i = 1; i <= 1000; i++) b.api.write(i);
  const afterLoop = {
    timeMs: performance.now() - t0,
    renders: rc() - before,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };
  // 排空微任务
  await new Promise((r) => queueMicrotask(r));
  const afterMicro = {
    timeMs: performance.now() - t0,
    renders: rc() - before,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };
  // 一个宏任务
  await sleep(0);
  const afterMacro = {
    timeMs: performance.now() - t0,
    renders: rc() - before,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };
  // 等待文本出现
  const commitWait = await waitForText("#1000");
  const afterText = {
    timeMs: performance.now() - t0,
    renders: rc() - before,
    domWrites: b.domWrites,
    moRecords: b.moTypesSnapshot.length,
  };
  return { afterLoop, afterMicro, afterMacro, afterText, commitWaitMs: commitWait };
})()`);

console.log(JSON.stringify(result, null, 2));
