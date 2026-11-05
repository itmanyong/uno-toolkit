import { expect, test } from "rstack/test";
import * as React from "react";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { defineComponent } from "../src/react/Host";
import { inject, provide } from "../src/compat/instance";
import { resetTxnForTest } from "../src/core/txn";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mount(element: ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function unmount(root: Root, container: HTMLElement): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

test("defineComponent：父 provide、子 inject 跨宿主实例连通", async () => {
  resetTxnForTest();
  const Child = defineComponent(() => {
    const theme = inject("theme", "fallback");
    return () => <p className="child">{theme}</p>;
  });
  const Parent = defineComponent(() => {
    provide("theme", "dark");
    return () => (
      <div className="parent">
        <Child />
      </div>
    );
  });
  const { container, root } = mount(<Parent />);
  expect(container.querySelector(".child")?.textContent).toBe("dark");
  unmount(root, container);
});

test("defineComponent：多层嵌套沿 parent 链向上查找 inject", async () => {
  resetTxnForTest();
  const Child = defineComponent(() => {
    // theme 来自直接父级，lang 需要跨祖父级沿链向上找
    const theme = inject("theme", "theme:fallback");
    const lang = inject("lang", "lang:fallback");
    return () => (
      <p>
        {theme}/{lang}
      </p>
    );
  });
  const Parent = defineComponent(() => {
    provide("theme", "dark");
    return () => <div><Child /></div>;
  });
  const Grandparent = defineComponent(() => {
    provide("lang", "zh");
    return () => <div><Parent /></div>;
  });
  const { container, root } = mount(<Grandparent />);
  expect(container.querySelector("p")?.textContent).toBe("dark/zh");
  unmount(root, container);
});

test("defineComponent：无祖先 provide 时 inject 取 fallback", async () => {
  resetTxnForTest();
  const Child = defineComponent(() => {
    const theme = inject("theme", "fallback");
    return () => <p>{theme}</p>;
  });
  const { container, root } = mount(<Child />);
  expect(container.querySelector("p")?.textContent).toBe("fallback");
  unmount(root, container);
});
