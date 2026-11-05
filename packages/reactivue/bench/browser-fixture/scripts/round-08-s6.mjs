// Round 08 · S6 hydration 实测：ssr.html（服务端 renderToString 产物）+ hydrateRoot
// 口径：hydrateRoot 同步调用耗时（hydrateSyncMs）、首个 commit 落定耗时（hydrateSettleMs）、
// 首屏 innerHTML 与服务端输出一致性、hydrate 后写入仍直写（nodeValue 计数）。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto(`http://localhost:4173/ssr.html?r=${Date.now()}`, { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

const result = await page.evaluate(`(async () => {
  const drain = () => new Promise((r) => queueMicrotask(r));
  const b = window.__bench;

  const pre = {
    hydrateSyncMs: b.hydrateSyncMs,
    hydrateSettleMs: b.hydrateSettleMs,
    preHydrateHTML: b.preHydrateHTML,
    serverHTML: window.__SERVER_HTML__,
    htmlMatch: b.preHydrateHTML === window.__SERVER_HTML__,
  };

  // hydrate 后写入：文本通道仍直写 + 属性块更新
  b.resetCounters();
  const t0 = performance.now();
  b.api.write(999);
  await drain();
  const writeE2e = performance.now() - t0;

  const anchor = document.querySelector("[data-rv-anchor]");
  return {
    ...pre,
    postHydrate: {
      writeE2eMs: writeE2e,
      domWrites: b.domWrites,
      textValue: document.querySelector("p").textContent,
      textUpdated: document.querySelector("p").textContent.indexOf("999") >= 0,
      blockAttr: document.querySelector("[data-v]") ? document.querySelector("[data-v]").getAttribute("data-v") : null,
      blockClass: document.querySelector("[data-v]") ? document.querySelector("[data-v]").className : null,
      anchorPresent: !!anchor,
      anchorHidden: anchor ? anchor.hidden : null,
    },
  };
})()`);

console.log(JSON.stringify(result, null, 2));
