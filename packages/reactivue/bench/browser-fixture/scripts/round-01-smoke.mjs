// Round 01 · 冒烟：fixture 可访问、场景挂载、S1 快速写读正常
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto("http://localhost:4173/#s1", { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });
const smoke = await page.evaluate(`(async () => {
  const drain = () => new Promise((r) => queueMicrotask(r));
  const b = window.__bench;
  b.resetCounters();
  for (let i = 0; i < 10; i++) { b.api.write(i); await drain(); }
  const text = b.api.getText();
  b.resetCounters();
  b.api.write(777);
  await drain();
  return {
    scenario: b.scenario,
    textAfterWarmup: text,
    afterWrite777: b.api.getText(),
    domWrites: b.domWrites,
    commits: b.commitCount,
    ready: b.ready,
    ua: navigator.userAgent,
  };
})()`);
console.log(JSON.stringify(smoke, null, 2));
