// Round 05 · S5 判定口径：同一写入命中 文本 + 属性块（R12 帧内一致性）
// 50 轮：写入 → 下一 rAF → 收集本帧 MutationObserver 记录 → 判定文本/属性是否同帧。
const task = await taskSpace("reactivue-bench-browser-2026-11-05");
const page = task.page("p1");
await page.goto(`http://localhost:4173/?r=s5-${Date.now()}#s5`, { timeout: 20000 });
await page.waitForFunction(() => window.__bench && window.__bench.ready, undefined, { timeout: 10000 });

const result = await page.evaluate(`(async () => {
  const drain = () => new Promise((r) => queueMicrotask(r));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const b = window.__bench;

  // 预热 10 次
  for (let i = 0; i < 10; i++) { b.api.write(i); await nextFrame(); await drain(); }
  b.resetCounters();

  const frames = [];
  for (let round = 0; round < 50; round++) {
    b.resetCounters();
    const v = 1000 + round;
    const t0 = performance.now();
    b.api.write(v);
    await nextFrame();
    await drain();
    const e2e = performance.now() - t0;
    const types = b.moTypesSnapshot;
    if (types.length === 0) { frames.push({ round, v, empty: true }); continue; }
    const hasText = types.indexOf("characterData") >= 0;
    const hasAttr = types.indexOf("attributes") >= 0;
    frames.push({
      round,
      v,
      records: types.length,
      hasText,
      hasAttr,
      consistent: hasText === hasAttr,
      e2eMs: e2e,
      // 属性块落地核验
      attrValue: (document.querySelector("[data-v]") || {}).getAttribute ? document.querySelector("[data-v]").getAttribute("data-v") : null,
      textValue: (document.querySelector("p") || {}).textContent || null,
    });
  }

  const valid = frames.filter((f) => !f.empty);
  const inconsistent = valid.filter((f) => !f.consistent).length;
  const attrSettled = valid.filter((f) => f.attrValue === String(f.v)).length;
  const textSettled = valid.filter((f) => (f.textValue || "").indexOf(String(f.v)) >= 0).length;

  return {
    sampledFrames: valid.length,
    emptyFrames: frames.length - valid.length,
    inconsistentFrames: inconsistent,
    attrSettledInFrame: attrSettled,
    textSettledInFrame: textSettled,
    frames,
  };
})()`);

console.log(JSON.stringify(result, null, 2));
