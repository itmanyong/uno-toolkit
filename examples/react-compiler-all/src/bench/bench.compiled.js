import { c as _c } from "react/compiler-runtime";
/* React + React Compiler 方案：四个同构基准场景。
 * 复用共享 driver.ts。组件用 useState 驱动，setter 在 useEffect 里注册到模块级
 * store（渲染体保持纯净，避免触发 React Compiler 跳过 bailout）。 */
import { useEffect, useState } from "react";
import { makeDriver } from "./driver";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
const h = {};
let listArr = [];

/* 1. 纯文本 */
function TextScenario() {
  const $ = _c(4);
  const [v, setV] = useState(0);
  let t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      h.text = setV;
    };
    t1 = [setV];
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useEffect(t0, t1);
  let t2;
  if ($[2] !== v) {
    t2 = /*#__PURE__*/_jsxs("p", {
      "data-bench-final": "text",
      children: ["count: ", v]
    });
    $[2] = v;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

/* 2. computed 派生：内联派生值（编译器自动缓存中间计算） */
function ComputedScenario() {
  const $ = _c(5);
  const [v, setV] = useState(0);
  let t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      h.comp = setV;
    };
    t1 = [setV];
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useEffect(t0, t1);
  const double = v * 2;
  let t2;
  if ($[2] !== double || $[3] !== v) {
    t2 = /*#__PURE__*/_jsxs("p", {
      "data-bench-final": "computed",
      children: ["c: ", v, " \xB7 2c: ", double]
    });
    $[2] = double;
    $[3] = v;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

/* 3. 属性结构 */
function AttrScenario() {
  const $ = _c(4);
  const [v, setV] = useState(0);
  let t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      h.attr = setV;
    };
    t1 = [setV];
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useEffect(t0, t1);
  let t2;
  if ($[2] !== v) {
    t2 = /*#__PURE__*/_jsx("div", {
      className: "bench-attr",
      "data-v": v,
      "data-bench-final": "attr"
    });
    $[2] = v;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

/* 4. keyed 列表 */
function ListScenario() {
  const $ = _c(7);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      h.list = setItems;
    };
    t2 = [setItems];
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  useEffect(t1, t2);
  let t3;
  if ($[3] !== items) {
    t3 = items.map(_temp);
    $[3] = items;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t3) {
    t4 = /*#__PURE__*/_jsx("ul", {
      "data-bench-final": "list",
      children: t3
    });
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
function _temp(item) {
  return /*#__PURE__*/_jsx("li", {
    children: item
  }, item);
}
const scenarios = [{
  key: "text",
  setup: () => h.text?.(0),
  write: value => h.text?.(value),
  final: () => document.querySelector('[data-bench-final="text"]')?.textContent ?? ""
}, {
  key: "computed",
  setup: () => h.comp?.(0),
  write: value => h.comp?.(value),
  final: () => document.querySelector('[data-bench-final="computed"]')?.textContent ?? ""
}, {
  key: "attr",
  setup: () => h.attr?.(0),
  write: value => h.attr?.(value),
  final: () => document.querySelector('[data-bench-final="attr"]')?.getAttribute("data-v") ?? ""
}, {
  key: "list",
  setup: () => {
    listArr = [];
    h.list?.([]);
  },
  write: value => {
    listArr = [...listArr, `Item ${value}`];
    h.list?.(listArr);
  },
  final: () => String(document.querySelector('[data-bench-final="list"]')?.children.length ?? 0),
  isList: true
}];
export function BenchApp() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = /*#__PURE__*/_jsxs("main", {
      style: {
        padding: 24
      },
      children: [/*#__PURE__*/_jsx("h1", {
        children: "react + react-compiler bench"
      }), /*#__PURE__*/_jsx(TextScenario, {}), /*#__PURE__*/_jsx(ComputedScenario, {}), /*#__PURE__*/_jsx(AttrScenario, {}), /*#__PURE__*/_jsx(ListScenario, {})]
    });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export function installBench() {
  globalThis.__FRAMEWORK = "react-compiler";
  globalThis.__bench = makeDriver(scenarios);
  globalThis.__benchReady = true;
}