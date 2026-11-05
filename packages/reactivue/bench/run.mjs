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
// 主流程
// ===========================================================================
console.log("@uno-pc/reactivue benchmark（S1/S2 实测，S3-S12 见 bench/README.md）");
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
  spy.restore();
  recorder.disconnect();
  console.log("\n完成（exit 0）");
} catch (error) {
  console.error("benchmark 失败:", error);
  process.exit(1);
}
