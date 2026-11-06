/* React + React Compiler 方案：四个同构基准场景。
 * 复用共享 driver.ts。组件用 useState 驱动，setter 在 useEffect 里注册到模块级
 * store（渲染体保持纯净，避免触发 React Compiler 跳过 bailout）。 */
import { useEffect, useState } from "react";
import { makeDriver } from "./driver";
import type { Scenario } from "./driver";

interface Handlers {
  text?: (v: number) => void;
  comp?: (v: number) => void;
  attr?: (v: number) => void;
  list?: (items: string[]) => void;
}
const h: Handlers = {};
let listArr: string[] = [];

/* 1. 纯文本 */
function TextScenario() {
  const [v, setV] = useState(0);
  useEffect(() => {
    h.text = setV;
  }, [setV]);
  return <p data-bench-final="text">count: {v}</p>;
}

/* 2. computed 派生：内联派生值（编译器自动缓存中间计算） */
function ComputedScenario() {
  const [v, setV] = useState(0);
  useEffect(() => {
    h.comp = setV;
  }, [setV]);
  const double = v * 2;
  return (
    <p data-bench-final="computed">
      c: {v} · 2c: {double}
    </p>
  );
}

/* 3. 属性结构 */
function AttrScenario() {
  const [v, setV] = useState(0);
  useEffect(() => {
    h.attr = setV;
  }, [setV]);
  return <div className="bench-attr" data-v={v} data-bench-final="attr" />;
}

/* 4. keyed 列表 */
function ListScenario() {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    h.list = setItems;
  }, [setItems]);
  return (
    <ul data-bench-final="list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const scenarios: Scenario[] = [
  {
    key: "text",
    setup: () => h.text?.(0),
    write: (value) => h.text?.(value),
    final: () =>
      document.querySelector('[data-bench-final="text"]')?.textContent ?? "",
  },
  {
    key: "computed",
    setup: () => h.comp?.(0),
    write: (value) => h.comp?.(value),
    final: () =>
      document.querySelector('[data-bench-final="computed"]')?.textContent ??
      "",
  },
  {
    key: "attr",
    setup: () => h.attr?.(0),
    write: (value) => h.attr?.(value),
    final: () =>
      document
        .querySelector('[data-bench-final="attr"]')
        ?.getAttribute("data-v") ?? "",
  },
  {
    key: "list",
    setup: () => {
      listArr = [];
      h.list?.([]);
    },
    write: (value) => {
      listArr = [...listArr, `Item ${value}`];
      h.list?.(listArr);
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
      <h1>react + react-compiler bench</h1>
      <TextScenario />
      <ComputedScenario />
      <AttrScenario />
      <ListScenario />
    </main>
  );
}

export function installBench(): void {
  (globalThis as any).__FRAMEWORK = "react-compiler";
  (globalThis as any).__bench = makeDriver(scenarios);
  (globalThis as any).__benchReady = true;
}
