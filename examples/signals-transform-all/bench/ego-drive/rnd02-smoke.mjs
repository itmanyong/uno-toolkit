// round-02: preact-signals bench smoke test via ego-lite
const url = "http://localhost:3001/?bench=1";
const task = await taskSpace("preact-signals-browser-bench");
const page = task.page("p1");
await page.goto(url);
await page.waitForFunction(() => globalThis.__benchReady === true, undefined, {
  timeout: 15000,
});
await page.evaluate(() => {
  globalThis.__benchEnsuredPromise = globalThis.__bench.runAll(100, 20);
});
await page.waitForFunction(
  () => globalThis.__benchResult !== undefined,
  undefined,
  {
    timeout: 60000,
  },
);
const result = await page.evaluate(() => globalThis.__benchResult);
console.log("SIGNALS-SMOKE " + JSON.stringify(result));
await task.finish({ keep: [] });
