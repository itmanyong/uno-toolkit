import { expect, test } from "rstack/test";
import * as React from "react";
import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ref } from "@vue/reactivity";
import { TextBinding } from "../src/react/TextBinding";
import { defineComponent } from "../src/react/Host";
import {
  Block,
  createCompiledHost,
  MemoBlock,
} from "../src/internal";
import {
  getSetupCallCount,
  resetSetupCallCount,
} from "../src/core/setup";
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

test("TextBinding 直写 Text 节点且不触发 React 重渲染", async () => {
  resetTxnForTest();
  const count = ref(1);
  let renders = 0;
  const View = (): ReactElement => {
    renders += 1;
    return <TextBinding value={() => count.value} />;
  };
  const { container, root } = mount(<View />);
  expect(container.textContent).toContain("1");
  expect(renders).toBe(1);

  act(() => {
    count.value = 2;
  });
  await flush();
  expect(container.textContent).toContain("2");
  expect(renders).toBe(1);
  unmount(root, container);
});

test("defineComponent 的 setup 只跑一次且响应式变化能更新 UI", async () => {
  resetTxnForTest();
  resetSetupCallCount();
  const count = ref(0);
  const Counter = defineComponent(() => () => <span>{count.value}</span>);
  const { container, root } = mount(<Counter />);
  expect(container.textContent).toBe("0");
  expect(getSetupCallCount()).toBe(1);

  act(() => {
    count.value = 7;
  });
  await flush();
  expect(container.textContent).toBe("7");
  expect(getSetupCallCount()).toBe(1);
  unmount(root, container);
});

test("父级重渲染不会覆盖 TextBinding 直写的值", async () => {
  resetTxnForTest();
  const count = ref(1);
  let renderParent: (() => void) | undefined;
  const Parent = (): ReactElement => {
    const [, setTick] = useState(0);
    renderParent = () => setTick(1);
    return <TextBinding value={() => count.value} />;
  };
  const { container, root } = mount(<Parent />);
  act(() => {
    count.value = 3;
  });
  await flush();
  expect(container.textContent).toContain("3");
  act(() => {
    renderParent?.();
  });
  expect(container.textContent).toContain("3");
  unmount(root, container);
});

test("编译产物形态：createCompiledHost 只刷新命中块，宿主不重渲染", async () => {
  resetTxnForTest();
  resetSetupCallCount();
  const count = ref(1);
  let hostRenders = 0;
  const Compiled = createCompiledHost(() => ({
    render: () => (
      <main>
        <TextBinding value={() => count.value} />
        <Block
          render={() => (
            <span data-role="tag" className={count.value > 5 ? "big" : "small"}>tag</span>
          )}
        />
      </main>
    ),
  }));
  const Wrapper = (): ReactElement => {
    hostRenders += 1;
    return <Compiled />;
  };
  const { container, root } = mount(<Wrapper />);
  expect(container.textContent).toContain("1");
  expect(container.querySelector('span[data-role="tag"]')?.className).toBe("small");
  expect(getSetupCallCount()).toBe(1);

  act(() => {
    count.value = 9;
  });
  await flush();
  expect(container.textContent).toContain("9");
  expect(container.querySelector('span[data-role="tag"]')?.className).toBe("big");
  expect(hostRenders).toBe(1);
  expect(getSetupCallCount()).toBe(1);
  unmount(root, container);
});

test("v-memo 的额外触发源经 revision 刷新非响应式文本", async () => {
  resetTxnForTest();
  resetSetupCallCount();
  const bucket = { label: "A" };
  const Compiled = createCompiledHost<{ version: number }>((props) => ({
    render: () => (
      <MemoBlock
        deps={() => [props.version]}
        render={() => (
          <p>
            <TextBinding value={() => bucket.label} />
          </p>
        )}
      />
    ),
  }));
  let setVersion: ((next: number) => void) | undefined;
  const Parent = (): ReactElement => {
    const [version, setState] = useState(0);
    setVersion = setState;
    return <Compiled version={version} />;
  };
  const { container, root } = mount(<Parent />);
  expect(container.textContent).toContain("A");

  bucket.label = "B";
  act(() => {
    setVersion?.(1);
  });
  await flush();
  expect(container.textContent).toContain("B");
  expect(getSetupCallCount()).toBe(1);
  unmount(root, container);
});

test("卸载后文本绑定不再写 DOM", async () => {
  resetTxnForTest();
  const count = ref(1);
  const { container, root } = mount(<TextBinding value={() => count.value} />);
  const textNode = container.firstChild;
  expect(textNode?.nodeValue).toBe("1");
  unmount(root, container);
  act(() => {
    count.value = 9;
  });
  await flush();
  expect(textNode?.nodeValue).toBe("1");
});

test("v-memo 纯 ref deps 变化触发整块刷新（额外触发源通知通道）", async () => {
  resetTxnForTest();
  const epoch = ref(0);
  // 非响应式：只有块被重渲染时才会读到最新值，作为「deps 驱动重渲染」的证物。
  let nonce = 0;
  const { container, root } = mount(
    <MemoBlock
      deps={() => [epoch.value]}
      render={() => <p>nonce:{String(nonce)}</p>}
    />,
  );
  expect(container.textContent).toContain("nonce:0");

  nonce = 1;
  await act(async () => {
    epoch.value += 1;
  });
  expect(container.textContent).toContain("nonce:1");

  unmount(root, container);
});

test("结构块连续多次依赖更新都生效", async () => {
  resetTxnForTest();
  const items = ref<string[]>(["a", "b", "c"]);
  const { container, root } = mount(
    <Block
      render={() => (
        <ul>{items.value.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
    />,
  );
  expect(container.querySelectorAll("li").length).toBe(3);

  items.value.push("d");
  await flush();
  expect(container.querySelectorAll("li").length).toBe(4);

  items.value.push("e");
  await flush();
  expect(container.querySelectorAll("li").length).toBe(5);

  items.value.pop();
  await flush();
  expect(container.querySelectorAll("li").length).toBe(4);

  unmount(root, container);
});
