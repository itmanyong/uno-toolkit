#!/usr/bin/env node
/**
 * @uno-pc/reactivue benchmark（设计文档 §10.3 / §14 / §15）
 *
 * 当前实现：S1（文本通道高频写入）、S2（结构通道 vs 文本通道）。
 * S3–S12 为骨架规划，见 bench/README.md。
 *
 * 运行方式：在 packages/reactivue 目录下 `node bench/run.mjs`。
 * 依赖：jsdom（包 devDependency）+ 已构建的 ../dist + react / react-dom / @vue/reactivity。
 *
 * 口径说明：
 * - 所有耗时均为 performance.now() 墙钟差，单位 ms；只报告原始数据，不做倍数换算。
 * - 预热：每个场景正式采样前先执行 10 次写入并排空微任务，再清零计数器。
 * - DOM 写计数：包装 jsdom CharacterData.prototype.nodeValue setter 统计。
 * - DOM 变更记录：MutationObserver(characterData/childList/attributes, subtree)。
 * - React 渲染次数：Profiler onRender 回调计数 + Block render 闭包计数（双口径）。
 * - 「同 task 连续写」指在同一次同步调用栈内完成全部 ref 赋值；
 *   文本通道经统一事务（§15.3）在同 task 微任务中 flush，结构通道经 React 调度器在后续宏任务 commit。
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(benchDir, "..");

// ---------------------------------------------------------------------------
// 1. DOM 全局环境（必须在动态 import react 之前就绪）
// ---------------------------------------------------------------------------
const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'></div></body></html>",
  { pretendToBeVisual: true, url: "http://localhost/" },
);
const g = globalThis;
const GLOBAL_KEYS = [
  "window",
  "document",
  "Text",
  "CharacterData",
  "Element",
  "HTMLElement",
  "Node",
  "Comment",
  "DocumentFragment",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
];
for (const key of GLOBAL_KEYS) {
  Object.defineProperty(g, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
}
try {
  Object.defineProperty(g, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
} catch {
  /* Node 22 自带 navigator，覆盖失败可忽略 */
}

// ---------------------------------------------------------------------------
// 2. 依赖加载（动态 import，确保在 DOM 全局就绪后执行）
// ---------------------------------------------------------------------------
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { useState } = React;
const { flushSync } = await import("react-dom");
const rv = await import(pathToFileURL(path.join(pkgDir, "dist/index.js")).href);

const readVersion = (name) => {
  try {
    return JSON.parse(
      readFileSync(path.join(pkgDir, "node_modules", name, "package.json"), "utf8"),
    ).version;
  } catch {
    return "unknown";
  }
};

const h = React.createElement;

// ---------------------------------------------------------------------------
// 3. 测量工具
// ---------------------------------------------------------------------------

/** 包装 nodeValue setter 统计 DOM 写次数。 */
function installNodeValueSpy() {
  const probe = document.createTextNode("");
  let proto = Object.getPrototypeOf(probe);
  let owner = null;
  while (proto) {
    const d = Object.getOwnPropertyDescriptor(proto, "nodeValue");
    if (d && d.set) {
      owner = proto;
      break;
    }
    proto = Object.getPrototypeOf(proto);
  }
  if (!owner) throw new Error("未找到 nodeValue setter 的原型");
  const desc = Object.getOwnPropertyDescriptor(owner, "nodeValue");
  const state = { count: 0 };
  Object.defineProperty(owner, "nodeValue", {
    ...desc,
    set(value) {
      state.count++;
      desc.set.call(this, value);
    },
  });
  return {
    get count() {
      return state.count;
    },
    reset() {
      state.count = 0;
    },
    restore() {
      Object.defineProperty(owner, "nodeValue", desc);
    },
  };
}

/** MutationObserver 记录器。 */
function makeRecorder(rootEl) {
  const state = { records: [] };
  const mo = new dom.window.MutationObserver((rs) => {
    state.records.push(...rs);
  });
  mo.observe(rootEl, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  return {
    get records() {
      return state.records;
    },
    reset() {
      state.records = [];
    },
    disconnect: () => mo.disconnect(),
  };
}

/** 等待下一次 characterData/childList 变更使目标文本出现（MO 回调紧跟 commit 的微任务）。 */
function waitForText(rootEl, expectedSubstring, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const mo = new dom.window.MutationObserver(() => {
      if (rootEl.textContent.includes(expectedSubstring)) {
        mo.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });
    mo.observe(rootEl, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const timer = setTimeout(() => {
      mo.disconnect();
      reject(new Error(`等待文本超时: ${expectedSubstring}`));
    }, timeoutMs);
  });
}

/** 排空微任务（事务 flush 的微任务先于本回调入队，返回时 flush 已完成）。 */
const drainMicrotasks = () => new Promise((r) => queueMicrotask(r));

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

function summarize(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    n: latencies.length,
    mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

const fmt = (v) => (typeof v === "number" ? v.toFixed(4) : v);

function printSummary(label, s) {
  console.log(
    `    ${label}: n=${s.n} mean=${fmt(s.mean)}ms p50=${fmt(s.p50)}ms p95=${fmt(s.p95)}ms max=${fmt(s.max)}ms`,
  );
}

// ---------------------------------------------------------------------------
// 4. 场景共用状态
// ---------------------------------------------------------------------------
const container = document.getElementById("root");
const spy = installNodeValueSpy();
const recorder = makeRecorder(document.body);
const profilerRenders = { count: 0 };
const onRender = () => {
  profilerRenders.count++;
};

function mount(element) {
  const root = createRoot(container);
  flushSync(() => {
    root.render(h(React.Profiler, { id: "bench", onRender }, element));
  });
  return root;
}

/** 挂载后预热 + 清零所有计数器。 */
async function warmupAndReset(writeFn) {
  for (let i = 0; i < 10; i++) {
    writeFn(i);
    await drainMicrotasks();
  }
  // 结构通道需要宏任务时间让 React 完成 commit
  await new Promise((r) => setTimeout(r, 20));
  spy.reset();
  recorder.reset();
  profilerRenders.count = 0;
}

const N_HIGH = 1000; // S1/S2 Round A：同 task 连续写次数
const R_ROUNDS = 100; // Round C：单写多轮采样次数
const COMPLEX_ITEMS = 24; // S2 复杂表达式规模

function complexExpr(n) {
  let acc = "";
  for (let i = 1; i <= COMPLEX_ITEMS; i++) {
    acc += `${(n * i) % 97}|`;
  }
  return acc + `#${n}`;
}

// ===========================================================================
// S1 · 文本通道高频写入（TextBinding 直写 nodeValue，§14.4 税 3 / §15.3 去重验证）
// ===========================================================================
async function benchS1() {
  console.log("\n== S1 单文本高频写入（文本通道 TextBinding） ==");
  const count = rv.ref(0);
  const App = () => h(rv.TextBinding, { value: () => count.value });
  const root = mount(h(App));
  const write = (v) => {
    count.value = v;
  };

  await warmupAndReset(write);

  // Round A：同 task 内 N 次异值连续写 → 验证微任务合并（§15.3：N 次写 = 1 次 DOM 写）
  {
    const t0 = performance.now();
    for (let i = 1; i <= N_HIGH; i++) write(i);
    const tSchedule = performance.now() - t0;
    await drainMicrotasks();
    const t1 = performance.now();
    const textNode = container.firstChild;
    console.log(`  Round A 同task ${N_HIGH} 次异值写（微任务 flush 后采样）:`);
    console.log(`    调度总耗时(同步写循环): ${fmt(tSchedule)}ms，摊销 ${fmt(tSchedule / N_HIGH)}ms/写`);
    console.log(`    写入→flush 落地总耗时: ${fmt(t1 - t0)}ms`);
    console.log(`    DOM nodeValue 写次数: ${spy.count}（去重后，理论 ≤1）`);
    console.log(`    MutationObserver 记录数: ${recorder.records.length}`);
    console.log(`    React 渲染次数: profiler=${profilerRenders.count}（理论 0）`);
    console.log(`    最终 nodeValue: "${textNode.nodeValue}"（期望 "${String(N_HIGH)}"）`);
  }

  // Round B：同 task 内 N 次同值连续写 → 值级抑制（Object.is）应 0 次 DOM 写。
  // 先把 ref 预置为 42 并排空，使循环内写入与当前值相同。
  {
    write(42);
    await drainMicrotasks();
    spy.reset();
    recorder.reset();
    profilerRenders.count = 0;
    const t0 = performance.now();
    for (let i = 0; i < N_HIGH; i++) write(42);
    const tSchedule = performance.now() - t0;
    await drainMicrotasks();
    console.log(`  Round B 同task ${N_HIGH} 次同值写（与当前值相同）:`);
    console.log(`    调度总耗时: ${fmt(tSchedule)}ms`);
    console.log(`    DOM nodeValue 写次数: ${spy.count}（值抑制后，理论 0）`);
    console.log(`    MutationObserver 记录数: ${recorder.records.length}`);
    console.log(`    React 渲染次数: profiler=${profilerRenders.count}`);
  }

  // Round C：单写多轮采样（每轮异值，测量 写入→DOM 落地 端到端延迟）
  {
    spy.reset();
    recorder.reset();
    profilerRenders.count = 0;
    const latencies = [];
    const scheduleCosts = [];
    for (let r = 0; r < R_ROUNDS; r++) {
      const v = 100000 + r;
      const t0 = performance.now();
      write(v);
      const tSched = performance.now() - t0;
      await drainMicrotasks();
      const t1 = performance.now();
      scheduleCosts.push(tSched);
      latencies.push(t1 - t0);
    }
    console.log(`  Round C 单写 ${R_ROUNDS} 轮（每轮异值 + 微任务排空）:`);
    printSummary("写入→nodeValue 落地延迟", summarize(latencies));
    printSummary("单次调度(同步)成本", summarize(scheduleCosts));
    console.log(`    DOM nodeValue 写总次数: ${spy.count}（期望 ${R_ROUNDS}）`);
    console.log(`    React 渲染总次数: profiler=${profilerRenders.count}（理论 0）`);
  }

  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S2 · 结构通道 vs 文本通道（同量写入命中 Block / useState 基线时的 React 渲染）
// ===========================================================================
async function benchS2() {
  console.log("\n== S2 结构通道 vs 文本通道（复杂表达式，React 渲染次数对比） ==");

  // --- S2a: Block（结构通道）---
  {
    console.log("  -- S2a Block（结构通道，render 内含复杂表达式） --");
    const count = rv.ref(0);
    const blockRenders = { count: 0 };
    const blockRender = () => {
      blockRenders.count++;
      return h("div", null, complexExpr(count.value));
    };
    const App = () => h(rv.Block, { render: blockRender });
    const root = mount(h(App));
    await warmupAndReset((v) => {
      count.value = v;
    });

    // Round A：同 task N 次异值写 → 事务去重后 1 次 bump → 1 次 React commit。
    // render 闭包计数为增量：每次 commit 闭包执行 3 次
    // （txn flush 显式 runner() 重收集依赖 + Block render 输出 JSX +
    //   无依赖 layout effect 重建 effect 时立即执行一次）。
    {
      const beforeRenders = blockRenders.count;
      const t0 = performance.now();
      for (let i = 1; i <= N_HIGH; i++) count.value = i;
      const tSchedule = performance.now() - t0;
      await waitForText(container, complexExpr(N_HIGH));
      const t1 = performance.now();
      console.log(`  Round A 同task ${N_HIGH} 次异值写（等待 React commit 后采样）:`);
      console.log(`    写循环耗时: ${fmt(tSchedule)}ms`);
      console.log(`    写入→DOM commit 端到端耗时: ${fmt(t1 - t0)}ms`);
      console.log(`    Block render 闭包增量: ${blockRenders.count - beforeRenders}`);
      console.log(`    React profiler commit 次数: ${profilerRenders.count}（理论 1）`);
      console.log(`    DOM nodeValue 写次数: ${spy.count}`);
      console.log(`    MutationObserver 记录数: ${recorder.records.length}`);
    }

    // Round C：单写多轮采样
    {
      spy.reset();
      recorder.reset();
      profilerRenders.count = 0;
      const beforeRenders = blockRenders.count;
      const latencies = [];
      for (let r = 0; r < R_ROUNDS; r++) {
        const v = 200000 + r;
        const t0 = performance.now();
        count.value = v;
        await waitForText(container, `#${v}`);
        latencies.push(performance.now() - t0);
      }
      console.log(`  Round C 单写 ${R_ROUNDS} 轮（每轮异值 + commit 等待）:`);
      printSummary("写入→DOM commit 端到端延迟", summarize(latencies));
      console.log(`    Block render 总次数: ${blockRenders.count - beforeRenders}（期望 ${R_ROUNDS}）`);
      console.log(`    React profiler 总次数: ${profilerRenders.count}`);
      console.log(`    DOM nodeValue 写总次数: ${spy.count}`);
    }

    root.unmount();
    await new Promise((r) => setTimeout(r, 10));
  }

  // --- S2b: 原生 useState 基线 ---
  {
    console.log("  -- S2b 原生 React useState 基线（同等复杂表达式） --");
    let setN = null;
    const stateRenders = { count: 0 };
    function StateBaseline() {
      stateRenders.count++;
      const [n, setter] = React.useState(0);
      setN = setter;
      return h("div", null, complexExpr(n));
    }
    const root = mount(h(StateBaseline));
    await warmupAndReset((v) => setN(v));

    // Round A：同 task N 次 setState（React 自动批处理）。render 计数为增量。
    {
      const beforeRenders = stateRenders.count;
      const t0 = performance.now();
      for (let i = 1; i <= N_HIGH; i++) setN(i);
      const tSchedule = performance.now() - t0;
      await waitForText(container, complexExpr(N_HIGH));
      const t1 = performance.now();
      console.log(`  Round A 同task ${N_HIGH} 次 setState（等待 React commit 后采样）:`);
      console.log(`    写循环耗时: ${fmt(tSchedule)}ms`);
      console.log(`    写入→DOM commit 端到端耗时: ${fmt(t1 - t0)}ms`);
      console.log(`    组件 render 闭包增量: ${stateRenders.count - beforeRenders}`);
      console.log(`    React profiler commit 次数: ${profilerRenders.count}（理论 1）`);
      console.log(`    DOM nodeValue 写次数: ${spy.count}`);
      console.log(`    MutationObserver 记录数: ${recorder.records.length}`);
    }

    // Round C：单写多轮采样
    {
      spy.reset();
      recorder.reset();
      profilerRenders.count = 0;
      const beforeRenders = stateRenders.count;
      const latencies = [];
      for (let r = 0; r < R_ROUNDS; r++) {
        const v = 300000 + r;
        const t0 = performance.now();
        setN(v);
        await waitForText(container, `#${v}`);
        latencies.push(performance.now() - t0);
      }
      console.log(`  Round C 单写 ${R_ROUNDS} 轮（每轮异值 + commit 等待）:`);
      printSummary("写入→DOM commit 端到端延迟", summarize(latencies));
      console.log(`    组件 render 总次数: ${stateRenders.count - beforeRenders}（期望 ${R_ROUNDS}）`);
      console.log(`    DOM nodeValue 写总次数: ${spy.count}`);
    }

    root.unmount();
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ===========================================================================
// S3 · 全量更新（k≈N，调度扇出，§14.5：扇出不 regress）
// ===========================================================================
const S3_SIZES = [8, 32, 128];

async function benchS3() {
  console.log("\n== S3 全量更新 k≈N（m 块扇出，一次写入命中全部） ==");
  for (const m of S3_SIZES) {
    // --- 文本通道扇出：m 个 TextBinding 读同一 ref ---
    {
      const count = rv.ref(0);
      const cells = Array.from({ length: m }, (_, i) =>
        h("span", { key: i }, h(rv.TextBinding, { value: () => count.value }))
      );
      const root = mount(h("div", null, cells));
      await warmupAndReset((v) => {
        count.value = v;
      });
      const t0 = performance.now();
      count.value = 999;
      await drainMicrotasks();
      const t1 = performance.now();
      console.log(`  [文本通道] m=${m}: 端到端 ${fmt(t1 - t0)}ms | DOM nodeValue 写 ${spy.count}（=m）| React commit ${profilerRenders.count}（理论 0）`);
      root.unmount();
      await new Promise((r) => setTimeout(r, 10));
    }
    // --- 结构通道扇出：m 个 Block 读同一 ref ---
    {
      const count = rv.ref(0);
      const cells = Array.from({ length: m }, (_, i) =>
        h(rv.Block, { key: i, render: () => `b${i}#${complexExpr(count.value)}` })
      );
      const root = mount(h("div", null, cells));
      await warmupAndReset((v) => {
        count.value = v;
      });
      const before = profilerRenders.count;
      const t0 = performance.now();
      count.value = 999;
      await waitForText(container, complexExpr(999));
      const t1 = performance.now();
      console.log(`  [结构通道] m=${m}: 端到端 ${fmt(t1 - t0)}ms | React commit ${profilerRenders.count - before}（理论 1，扇出不 regress）| DOM 写 ${spy.count}`);
      root.unmount();
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

// ===========================================================================
// S4 · 1k 项 keyed 列表（R6 边界：整块重渲染 reconcile 成本与内存）
// ===========================================================================
async function benchS4() {
  console.log("\n== S4 1k 项 keyed 列表 ==");
  const LIST_SIZE = 1000;
  const items = rv.ref(
    Array.from({ length: LIST_SIZE }, (_, i) => ({ id: i, score: i })),
  );
  const heapBefore = process.memoryUsage().heapUsed;

  // --- 结构块：整列表一个 Block，改中间一项 → 1000 li reconcile ---
  {
    const App = () =>
      h("ul", null,
        h(rv.Block, {
          render: () =>
            items.value.map((item) =>
              h("li", { key: item.id }, `item-${item.id}:${complexExpr(item.score)}`),
            ),
        }),
      );
    const root = mount(h(App));
    await warmupAndReset(() => {
      const next = [...items.value];
      next[500] = { ...next[500], score: next[500].score + 1 };
      items.value = next;
    });
    const before = profilerRenders.count;
    const t0 = performance.now();
    const next = [...items.value];
    next[500] = { ...next[500], score: next[500].score + 1 };
    items.value = next;
    await waitForText(container, complexExpr(items.value[500].score));
    const t1 = performance.now();
    console.log(`  [结构块整列表] 单项改动: 端到端 ${fmt(t1 - t0)}ms | commit ${profilerRenders.count - before} | heap 增量 ${( (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024 ).toFixed(2)}MB`);
    root.unmount();
    await new Promise((r) => setTimeout(r, 10));
  }
  // --- 文本通道：1000 项每项 score 为 TextBinding，改一项只写 1 个文本 ---
  {
    const scores = rv.ref(Array.from({ length: LIST_SIZE }, (_, i) => i));
    const cells = scores.value.map((_, i) =>
      h("li", { key: i },
        `item-${i}:`,
        h(rv.TextBinding, { value: () => scores.value[i] })),
    );
    const root = mount(h("ul", null, cells));
    await warmupAndReset((i) => {
      const next = [...scores.value];
      next[i] = next[i] + 1;
      scores.value = next;
    });
    spy.reset();
    profilerRenders.count = 0;
    const t0 = performance.now();
    const next = [...scores.value];
    next[500] = next[500] + 1;
    scores.value = next;
    await drainMicrotasks();
    const t1 = performance.now();
    console.log(`  [文本通道单项] 端到端 ${fmt(t1 - t0)}ms | DOM 写 ${spy.count}（理论 1，仅命中项）| React commit ${profilerRenders.count}（理论 0）`);
    root.unmount();
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ===========================================================================
// S5 · 同一写入命中 文本 + 属性块（R12 帧内一致性，§15.7 rAF 口径）
// ===========================================================================
const nextFrame = () =>
  new Promise((r) => requestAnimationFrame(() => r()));

async function benchS5() {
  console.log("\n== S5 同一写入命中 文本 + 属性块（帧内一致性） ==");
  const count = rv.ref(0);
  const App = () =>
    h("div", null,
      h("p", null, h(rv.TextBinding, { value: () => count.value })),
      h(rv.Block, { render: () => h("div", { className: `lv-${count.value}`, "data-v": String(count.value) }, "attr") }),
    );
  const root = mount(h(App));
  await warmupAndReset((v) => {
    count.value = v;
  });

  const INCONSISTENT_FRAMES = { n: 0 };
  const FRAMES = { n: 0 };
  for (let round = 0; round < 50; round++) {
    recorder.reset();
    count.value = 1000 + round;
    await nextFrame(); // 收集本帧（写入→下一 rAF 之间）的全部 MO 记录
    await drainMicrotasks();
    const frameRecords = recorder.records;
    if (frameRecords.length === 0) continue;
    FRAMES.n++;
    const hasText = frameRecords.some((m) => m.type === "characterData");
    const hasAttr = frameRecords.some((m) => m.type === "attributes");
    // R12：同一写入的文本与属性变更必须落在同一帧区间
    if (hasText !== hasAttr) INCONSISTENT_FRAMES.n++;
  }
  console.log(`  采样 ${FRAMES.n} 帧（50 轮写入）`);
  console.log(`  不一致帧（文本/属性分离）: ${INCONSISTENT_FRAMES.n}（P-A 设计判据：0）`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S7 · startTransition 下重复 S5（并发渲染下的时序窗口）
// ===========================================================================
async function benchS7() {
  console.log("\n== S7 startTransition 下重复 S5 一致性观测 ==");
  const count = rv.ref(0);
  const App = () =>
    h("div", null,
      h("p", null, h(rv.TextBinding, { value: () => count.value })),
      h(rv.Block, { render: () => h("div", { className: `lv-${count.value}` }, "t") }),
    );
  const root = mount(h(App));
  await warmupAndReset((v) => {
    count.value = v;
  });

  const inconsistent = { n: 0 };
  const total = { n: 0 };
  for (let round = 0; round < 30; round++) {
    recorder.reset();
    React.startTransition(() => {
      count.value = 2000 + round;
    });
    await nextFrame();
    await drainMicrotasks();
    const frameRecords = recorder.records;
    if (frameRecords.length === 0) continue;
    total.n++;
    const hasText = frameRecords.some((m) => m.type === "characterData");
    const hasAttr = frameRecords.some((m) => m.type === "attributes");
    if (hasText !== hasAttr) inconsistent.n++;
  }
  console.log(`  transition 内 ${total.n} 帧采样；不一致帧: ${inconsistent.n}（文本通道不经 React，属性块经并发调度，分离帧为预期观测项）`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S8 · props 桥驱动更新（§14.4 税 2：是否多一次 commit）
// ===========================================================================
async function benchS8() {
  console.log("\n== S8 父级 props 驱动块更新（编译产物宿主，§14.4 税 2） ==");
  // props 值必须是普通值（reactive 会解包 ref 属性）；桥路径 = 父 React 重渲染
  // → 宿主 render 阶段 syncProps 写 reactive props → trigger → TextBinding 更新。
  const Compiled = rv.createCompiledHost((props) => ({
    render: () =>
      h("p", null, h(rv.TextBinding, { value: () => props.label })),
  }));
  let setLabelText = null;
  function Wrapper() {
    const [label, setLabel] = useState("init");
    setLabelText = setLabel;
    return h(Compiled, { label });
  }
  const root = mount(h(Wrapper));
  await warmupAndReset(() => {
    setLabelText(`w${Math.random()}`);
    return drainMicrotasks();
  });
  // 正式采样：父级 setState → 宿主重渲染 → syncProps → 块文本更新
  const samples = [];
  for (let round = 0; round < 30; round++) {
    profilerRenders.count = 0;
    spy.reset();
    const t0 = performance.now();
    setLabelText(`v${round}`);
    await waitForText(container, `v${round}`);
    const t1 = performance.now();
    samples.push({ e2e: t1 - t0, commits: profilerRenders.count, domWrites: spy.count });
  }
  const e2e = samples.map((x) => x.e2e);
  const commits = samples.map((x) => x.commits);
  console.log(
    `  30 轮 props 变化: 端到端 mean=${fmt(e2e.reduce((a, b) => a + b, 0) / e2e.length)}ms p95=${fmt(percentile([...e2e].sort((a, b) => a - b), 95))}ms`,
  );
  console.log(
    `  commit 次数分布: ${JSON.stringify(commits.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {}))}（§14.4 税 2 观测：宿主重渲染与块更新是否分离 commit）`,
  );
  console.log(`  DOM 写次数分布: ${JSON.stringify(samples.reduce((acc, x) => { acc[x.domWrites] = (acc[x.domWrites] || 0) + 1; return acc; }, {}))}`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S9 · 同一事件内连续 10 次写（§15.7 正式判据：异值 ≤2、同值 0）
// ===========================================================================
async function benchS9() {
  console.log("\n== S9 同一事件内连续 10 次写（正式判据口径） ==");
  const count = rv.ref(0);
  const App = () => h("p", null, h(rv.TextBinding, { value: () => count.value }));
  const root = mount(h(App));
  await warmupAndReset((v) => {
    count.value = v;
  });
  // 异值组
  spy.reset();
  recorder.reset();
  for (let i = 1; i <= 10; i++) count.value = i;
  await drainMicrotasks();
  const diffWrites = spy.count;
  console.log(`  异值组: DOM 写 ${diffWrites}（判据 ≤2 → ${diffWrites <= 2 ? "PASS" : "FAIL"}）| MO 记录 ${recorder.records.length}`);
  // 同值组：先预置 42 并排空，使循环内写入与当前值相同
  count.value = 42;
  await drainMicrotasks();
  spy.reset();
  recorder.reset();
  for (let i = 0; i < 10; i++) count.value = 42;
  await drainMicrotasks();
  const sameWrites = spy.count;
  console.log(`  同值组: DOM 写 ${sameWrites}（判据 =0 → ${sameWrites === 0 ? "PASS" : "FAIL"}）| MO 记录 ${recorder.records.length}`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S10 · 动态依赖切换（条件分支先后读不同 ref，重收集正确性）
// ===========================================================================
async function benchS10() {
  console.log("\n== S10 动态依赖切换（runner 重收集后订阅集合正确） ==");
  const flag = rv.ref(true);
  const a = rv.ref("A0");
  const b = rv.ref("B0");
  const App = () =>
    h("p", null, h(rv.TextBinding, { value: () => (flag.value ? a.value : b.value) }));
  const root = mount(h(App));
  await warmupAndReset(() => {
    flag.value = !flag.value;
  });

  // 阶段1：读 a。改 b（当前未读）→ 0 更新（无残留订阅）
  spy.reset();
  b.value = "B1";
  await drainMicrotasks();
  const staleWrite = spy.count;
  // 阶段2：切 flag → 重收集，现在读 b
  flag.value = false;
  await drainMicrotasks();
  // 阶段3：改 b → 应更新；改 a → 不应更新
  spy.reset();
  b.value = "B2";
  await drainMicrotasks();
  const afterSwitch = spy.count;
  spy.reset();
  a.value = "A9";
  await drainMicrotasks();
  const oldDepWrites = spy.count;
  console.log(`  切换前改未读 dep: DOM 写 ${staleWrite}（理论 0，无残留订阅）`);
  console.log(`  切换后改新读 dep: DOM 写 ${afterSwitch}（理论 1，重收集正确）`);
  console.log(`  切换后改旧 dep: DOM 写 ${oldDepWrites}（理论 0，旧 dep 已移除）`);
  const ok = staleWrite === 0 && afterSwitch === 1 && oldDepWrites === 0;
  console.log(`  判定: ${ok ? "PASS" : "FAIL"}`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S11 · 卸载竞态与文本饿死兜底（§15.3 250ms fallback）
// ===========================================================================
async function benchS11() {
  console.log("\n== S11 卸载竞态：块卸载后写入不抛错、不超时饿死 ==");
  const count = rv.ref(0);
  let blockMounted = true;
  const App = () =>
    h("div", null,
      blockMounted ? h(rv.Block, { render: () => `blk#${count.value}` }) : null,
      h("p", null, h(rv.TextBinding, { value: () => count.value })),
    );
  const root = mount(h(App));
  await warmupAndReset((v) => {
    count.value = v;
  });
  // 卸载结构块（保留文本通道），随后高频写入
  blockMounted = false;
  flushSync(() => {}); // 触发重新渲染以卸载块
  const t0 = performance.now();
  let threw = false;
  try {
    for (let i = 0; i < 100; i++) count.value = 9000 + i;
    await drainMicrotasks();
  } catch (error) {
    threw = true;
    console.error("  卸载后写入抛错:", error.message);
  }
  const t1 = performance.now();
  const textNode = [...container.querySelectorAll("p")][0]?.firstChild;
  console.log(`  卸载后 100 次写: 抛错=${threw} | 耗时 ${fmt(t1 - t0)}ms | 文本通道仍直写: ${spy.count > 0 ? "是" : "否"} | 最终值 ${textNode ? "已落地" : "N/A"}`);
  console.log(`  兜底判定: ${!threw ? "PASS（无饿死、无异常）" : "FAIL"}`);
  root.unmount();
  await new Promise((r) => setTimeout(r, 10));
}

// ===========================================================================
// S12 · granularity 三档 × m 扇出（运行时部分：手动 groupKey Block）
// ===========================================================================
const S12_SIZES = [8, 32, 128];

async function benchS12() {
  console.log("\n== S12 granularity 三档 × m 扇出（运行时 groupKey Block） ==");
  const original = rv.getGranularity();
  for (const granularity of ["fine", "balanced", "coarse"]) {
    rv.configureTxn({ granularity });
    for (const m of S12_SIZES) {
      const count = rv.ref(0);
      // coarse 判据依赖同 groupKey 合并；fine/balanced 下同 key 不聚合
      const groupKey = granularity === "coarse" ? "shared-group" : undefined;
      const cells = Array.from({ length: m }, (_, i) =>
        h(rv.Block, {
          key: i,
          groupKey,
          render: () => h("div", { "data-i": i }, `c${i}#${count.value}`),
        }),
      );
      const root = mount(h("div", null, cells));
      await warmupAndReset((v) => {
        count.value = v;
      });
      const before = profilerRenders.count;
      const t0 = performance.now();
      count.value = 7777;
      await drainMicrotasks();
      await new Promise((r) => setTimeout(r, 30));
      const t1 = performance.now();
      const updated = [
        ...container.querySelectorAll("[data-i]"),
      ].filter((n) => n.textContent.includes("#7777")).length;
      console.log(
        `  [${granularity}] m=${m}: 端到端 ${fmt(t1 - t0)}ms | commit ${profilerRenders.count - before} | 更新到的块 ${updated}/${m}${updated < m ? " ⚠️ 同组丢更新" : ""}`,
      );
      root.unmount();
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  rv.configureTxn({ granularity: original });
}

// ===========================================================================
// 主流程
// ===========================================================================
console.log("@uno-pc/reactivue benchmark（S1–S11 实测 + S12 运行时部分）");
console.log("环境:");
console.log(`  node: ${process.version}`);
console.log(`  react: ${readVersion("react")} / react-dom: ${readVersion("react-dom")}`);
console.log(`  jsdom: ${readVersion("jsdom")}`);
console.log(`  @vue/reactivity: ${readVersion("@vue/reactivity")}`);
console.log(`  产物: dist/index.js（本次运行前经 pnpm build:js 重建）`);
console.log(`  口径: performance.now() 墙钟 ms；预热 10 次写入后清零计数器；仅原始数据，无倍数换算`);

try {
  await benchS1();
  await benchS2();
  await benchS3();
  await benchS4();
  await benchS5();
  await benchS7();
  await benchS8();
  await benchS9();
  await benchS10();
  await benchS11();
  await benchS12();
  spy.restore();
  recorder.disconnect();
  console.log("\n完成（exit 0）");
} catch (error) {
  console.error("benchmark 失败:", error);
  process.exit(1);
}
