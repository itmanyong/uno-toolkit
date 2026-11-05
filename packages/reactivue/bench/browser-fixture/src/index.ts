/**
 * 浏览器判定口径 benchmark fixture 入口。
 *
 * 职责：
 * 1. 在 React 挂载前安装 CharacterData.prototype.nodeValue 计数器（DOM 直写次数口径）；
 * 2. 安装 document.body 上的 MutationObserver 记录器（characterData/childList/attributes）；
 * 3. 按 location.hash 渲染对应场景（见 scenarios.ts），并把场景 api 暴露到 window.__bench；
 * 4. 若 window.__HYDRATE__（ssr.html，由 scripts/ssr-generate.mjs 生成），走 hydrateRoot 分支
 *    并记录 hydration 耗时与首屏一致性数据。
 */
import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { createScenario, SCENARIO_NAMES } from "./scenarios";

const h = React.createElement;

// ---------------------------------------------------------------------------
// 1. nodeValue 直写计数（先于任何挂载安装）
// ---------------------------------------------------------------------------
let domWriteCount = 0;
{
  // Chrome 中 nodeValue 定义在 Node.prototype（jsdom 在 CharacterData.prototype），
  // 从探针节点沿原型链上溯找到持有 setter 的原型（与 bench/run.mjs 口径一致）。
  const probe = document.createTextNode("");
  let proto: object | null = Object.getPrototypeOf(probe);
  let owner: object | null = null;
  while (proto) {
    const d = Object.getOwnPropertyDescriptor(proto, "nodeValue");
    if (d && d.set) {
      owner = proto;
      break;
    }
    proto = Object.getPrototypeOf(proto);
  }
  if (owner) {
    const desc = Object.getOwnPropertyDescriptor(owner, "nodeValue")!;
    Object.defineProperty(owner, "nodeValue", {
      ...desc,
      set(value: string) {
        domWriteCount++;
        desc.set!.call(this, value);
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 2. MutationObserver 记录器
// ---------------------------------------------------------------------------
const moTypes: string[] = [];
const mo = new MutationObserver((rs) => {
  for (const r of rs) moTypes.push(r.type);
});
mo.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
});

// ---------------------------------------------------------------------------
// 3. 计数器与 Profiler commit 计数
// ---------------------------------------------------------------------------
let commits = 0;

interface BenchWindow {
  __bench?: {
    ready: boolean;
    scenario: string;
    api: BenchApi | null;
    preHydrateHTML: string;
    hydrateSyncMs: number;
    hydrateSettleMs: number;
    resetCounters(): void;
    readonly domWrites: number;
    readonly moTypes: string[];
    readonly commits: number;
    [key: string]: unknown;
  };
}

interface BenchApi {
  [key: string]: unknown;
}

const w = window as unknown as BenchWindow;
w.__bench = {
  ready: false,
  scenario: "",
  api: null as BenchApi | null,
  preHydrateHTML: "",
  hydrateSyncMs: 0,
  hydrateSettleMs: 0,
  resetCounters() {
    domWriteCount = 0;
    moTypes.length = 0;
    commits = 0;
  },
  get domWrites() {
    return domWriteCount;
  },
  get moTypesSnapshot() {
    return moTypes.slice();
  },
  get commitCount() {
    return commits;
  },
};

const rootEl = document.getElementById("root")!;

/** 场景就绪标记：挂载 commit 的 effect 中置位 */
function ReadyMarker(): null {
  React.useEffect(() => {
    w.__bench.ready = true;
  }, []);
  return null;
}

/** hydration settle 标记：hydrate 首个 commit 的 effect 中记录耗时（生产构建无 Profiler 回调） */
function HydrateSettleMarker({ start }: { start: number }): null {
  React.useEffect(() => {
    w.__bench.hydrateSettleMs = performance.now() - start;
    w.__bench.ready = true;
  }, []);
  return null;
}

if (w.__HYDRATE__) {
  // --- S6 hydration 分支（服务端渲染的 ssr.html） ---
  const { element, api } = createScenario("s6");
  w.__bench.preHydrateHTML = rootEl.innerHTML;
  w.__bench.api = api;
  const t0 = performance.now();
  hydrateRoot(
    rootEl,
    h(
      "div",
      null,
      h(
        React.Profiler,
        { id: "bench", onRender: () => { commits++; } },
        element,
      ),
      h(HydrateSettleMarker, { start: t0 }),
    ),
  );
  w.__bench.hydrateSyncMs = performance.now() - t0;
} else {
  // --- hash 路由分支 ---
  const root = createRoot(rootEl);
  const renderFor = () => {
    const name = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!SCENARIO_NAMES.includes(name)) {
      w.__bench.scenario = "menu";
      root.render(
        h(
          "ul",
          null,
          SCENARIO_NAMES.map((n) =>
            h("li", { key: n }, h("a", { href: `#${n}` }, n)),
          ),
        ),
      );
      return;
    }
    w.__bench.ready = false;
    w.__bench.scenario = name;
    const { element, api } = createScenario(name);
    w.__bench.api = api;
    root.render(
      h(
        "div",
        null,
        h(
          React.Profiler,
          { id: "bench", onRender: () => { commits++; } },
          element,
        ),
        h(ReadyMarker),
      ),
    );
  };
  renderFor();
  window.addEventListener("hashchange", renderFor);
}
