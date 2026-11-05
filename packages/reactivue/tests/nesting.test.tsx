import { expect, test } from "rstack/test";
import * as React from "react";
import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ref } from "@vue/reactivity";
import { defineComponent } from "../src/react/Host";
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(container: HTMLElement, text: string): Promise<void> {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** 普通 React 子组件：自带 useState。 */
function ReactChild({ label }: { label: string }): ReactElement {
  const [n, setN] = useState(0);
  return (
    <div className="react-child">
      <span>{label}:{n}</span>
      <button onClick={() => setN((value) => value + 1)}>{label}+1</button>
    </div>
  );
}

/** 场景 A：reactivue 组件内嵌普通 React 组件。 */
const HostWithReactChild = defineComponent(() => {
  const count = ref(0);
  return () => (
    <div className="host-a">
      <p>host:{count.value}</p>
      <ReactChild label="child" />
      <button onClick={() => (count.value += 1)}>host+1</button>
    </div>
  );
});

test("reactivue 内嵌 React 组件：双方状态独立工作", async () => {
  resetTxnForTest();
  const { container, root } = mount(<HostWithReactChild />);
  expect(container.querySelector(".host-a p")?.textContent).toBe("host:0");
  expect(container.querySelector(".react-child span")?.textContent).toBe(
    "child:0",
  );

  // React 子组件自己的状态更新
  await click(container, "child+1");
  expect(container.querySelector(".react-child span")?.textContent).toBe(
    "child:1",
  );
  // 宿主文本不受影响
  expect(container.querySelector(".host-a p")?.textContent).toBe("host:0");

  // reactivue 宿主的响应式更新（连续两次，验证调度链持续存活）
  await click(container, "host+1");
  await flush();
  await click(container, "host+1");
  await flush();
  expect(container.querySelector(".host-a p")?.textContent).toBe("host:2");
  // React 子组件状态不被父块重渲染破坏
  expect(container.querySelector(".react-child span")?.textContent).toBe(
    "child:1",
  );

  unmount(root, container);
});

/** 内层 reactivue 组件。 */
const InnerReactivue = defineComponent(() => {
  const inner = ref(0);
  return () => (
    <b className="inner">
      inner:{inner.value}
      <button onClick={() => (inner.value += 1)}>inner+1</button>
    </b>
  );
});

/** 场景 B：reactivue 内嵌 reactivue。 */
const OuterReactivue = defineComponent(() => {
  const outer = ref(0);
  return () => (
    <div className="host-b">
      <p>outer:{outer.value}</p>
      <InnerReactivue />
      <button onClick={() => (outer.value += 1)}>outer+1</button>
    </div>
  );
});

test("reactivue 内嵌 reactivue：父子块各自独立更新", async () => {
  resetTxnForTest();
  const { container, root } = mount(<OuterReactivue />);
  expect(container.querySelector(".host-b p")?.textContent).toBe("outer:0");
  expect(container.querySelector(".inner")?.textContent).toContain("inner:0");

  await click(container, "inner+1");
  await flush();
  await click(container, "inner+1");
  await flush();
  expect(container.querySelector(".inner")?.textContent).toContain("inner:2");
  // 父文本不随子更新
  expect(container.querySelector(".host-b p")?.textContent).toBe("outer:0");

  await click(container, "outer+1");
  await flush();
  await click(container, "outer+1");
  await flush();
  expect(container.querySelector(".host-b p")?.textContent).toBe("outer:2");
  // 子块状态不被父块更新破坏
  expect(container.querySelector(".inner")?.textContent).toContain("inner:2");

  unmount(root, container);
});

/** 场景 C：三层嵌套 React > reactivue > React > reactivue。 */
const Leaf = defineComponent(() => {
  const leaf = ref("leaf-ok");
  return () => <i className="leaf">{leaf.value}</i>;
});

const Mid = defineComponent(() => {
  const mid = ref(0);
  return () => (
    <div className="mid">
      mid:{mid.value}
      <Leaf />
      <button onClick={() => (mid.value += 1)}>mid+1</button>
    </div>
  );
});

test("React > reactivue > React > reactivue 三层嵌套", async () => {
  resetTxnForTest();
  function Top(): ReactElement {
    const [top, setTop] = useState(0);
    return (
      <div className="top">
        top:{top}
        <Mid />
        <button onClick={() => setTop((value) => value + 1)}>top+1</button>
      </div>
    );
  }
  const { container, root } = mount(<Top />);
  expect(container.querySelector(".top")?.textContent).toContain("top:0");
  expect(container.querySelector(".mid")?.textContent).toContain("mid:0");
  expect(container.querySelector(".leaf")?.textContent).toBe("leaf-ok");

  await click(container, "top+1");
  expect(container.querySelector(".top")?.textContent).toContain("top:1");
  await click(container, "mid+1");
  await flush();
  await click(container, "mid+1");
  await flush();
  expect(container.querySelector(".mid")?.textContent).toContain("mid:2");
  expect(container.querySelector(".leaf")?.textContent).toBe("leaf-ok");

  unmount(root, container);
});
