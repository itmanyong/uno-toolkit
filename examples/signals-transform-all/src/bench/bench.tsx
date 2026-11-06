/* Preact Signals (via @uno-pc/signals-transform) 方案：四个同构基准场景。
 * 复用共享 driver.ts（framework-agnostic），信号放模块级，
 * 组件内读 .value 触发订阅；list 用新引用赋值触发。 */
import { signal, computed } from "@preact/signals-react";
import { makeDriver } from "./driver";
import type { Scenario } from "./driver";

/* 1. 纯文本 */
const textState = signal(0);
function TextScenario() {
  return <p data-bench-final="text">count: {textState.value}</p>;
}

/* 2. computed 派生 */
const compCount = signal(0);
const compDouble = computed(() => compCount.value * 2);
function ComputedScenario() {
  return (
    <p data-bench-final="computed">
      c: {compCount.value} · 2c: {compDouble.value}
    </p>
  );
}

/* 3. 属性结构 */
const attrState = signal(0);
function AttrScenario() {
  return (
    <div
      className="bench-attr"
      data-v={attrState.value}
      data-bench-final="attr"
    />
  );
}

/* 4. keyed 列表 */
const listState = signal<string[]>([]);
function ListScenario() {
  return (
    <ul data-bench-final="list">
      {listState.value.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const scenarios: Scenario[] = [
  {
    key: "text",
    setup: () => {
      textState.value = 0;
    },
    write: (value) => {
      textState.value = value;
    },
    final: () =>
      document.querySelector('[data-bench-final="text"]')?.textContent ?? "",
  },
  {
    key: "computed",
    setup: () => {
      compCount.value = 0;
    },
    write: (value) => {
      compCount.value = value;
    },
    final: () =>
      document.querySelector('[data-bench-final="computed"]')?.textContent ??
      "",
  },
  {
    key: "attr",
    setup: () => {
      attrState.value = 0;
    },
    write: (value) => {
      attrState.value = value;
    },
    final: () =>
      document
        .querySelector('[data-bench-final="attr"]')
        ?.getAttribute("data-v") ?? "",
  },
  {
    key: "list",
    setup: () => {
      listState.value = [];
    },
    write: (value) => {
      listState.value = [...listState.value, `Item ${value}`];
    },
    final: () =>
      String(
        document.querySelector('[data-bench-final="list"]')?.children.length ??
          0,
      ),
    isList: true,
  },
];

export function BenchApp() {
  return (
    <main style={{ padding: 24 }}>
      <h1>preact-signals bench</h1>
      <TextScenario />
      <ComputedScenario />
      <AttrScenario />
      <ListScenario />
    </main>
  );
}

export function installBench(): void {
  (globalThis as any).__FRAMEWORK = "preact-signals";
  (globalThis as any).__bench = makeDriver(scenarios);
  (globalThis as any).__benchReady = true;
}
