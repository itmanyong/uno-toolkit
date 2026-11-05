import { expect, test } from "rstack/test";
import * as React from "react";
import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { computed, ref } from "@vue/reactivity";
import {
  createSetup,
  onMounted,
  onUnmounted,
  useSetup,
} from "../src";
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

function click(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

test("useSetup：setup 只跑一次，ref 写入经微任务触发组件级重渲染", async () => {
  resetTxnForTest();
  let setupRuns = 0;
  let renders = 0;
  function Demo(): ReactElement {
    renders += 1;
    const state = useSetup(() => {
      setupRuns += 1;
      const count = ref(0);
      return { count };
    });
    return (
      <div>
        <p>count:{state.count}</p>
        <button onClick={() => (state.count += 1)}>+1</button>
      </div>
    );
  }
  const { container, root } = mount(<Demo />);
  expect(container.querySelector("p")?.textContent).toBe("count:0");
  expect(setupRuns).toBe(1);

  // proxyRefs 解包：直接对 count 赋值（等价 count.value += 1）
  click(container, "+1");
  await flush();
  click(container, "+1");
  await flush();
  expect(container.querySelector("p")?.textContent).toBe("count:2");
  // 组件级粒度：React 渲染次数随更新增长
  expect(renders).toBeGreaterThan(1);
  expect(setupRuns).toBe(1);
  unmount(root, container);
});

test("useSetup：computed 派生值与渲染计数", async () => {
  resetTxnForTest();
  let computedEvals = 0;
  function Demo(): ReactElement {
    const state = useSetup(() => {
      const count = ref(1);
      const doubled = computed(() => {
        computedEvals += 1;
        return count.value * 2;
      });
      return { count, doubled };
    });
    return (
      <div>
        <p>
          {state.count}/{state.doubled}
        </p>
        <button onClick={() => (state.count += 1)}>+1</button>
      </div>
    );
  }
  const { container, root } = mount(<Demo />);
  expect(container.querySelector("p")?.textContent).toBe("1/2");
  const evalsBefore = computedEvals;

  click(container, "+1");
  await flush();
  expect(container.querySelector("p")?.textContent).toBe("2/4");
  expect(computedEvals).toBeGreaterThan(evalsBefore);
  unmount(root, container);
});

test("useSetup：props 桥在父组件重渲染后同步", async () => {
  resetTxnForTest();
  function Demo({ base }: { base: number }): ReactElement {
    const state = useSetup(
      (props) => {
        const count = ref(props.base);
        const shifted = computed(() => count.value - props.base);
        return { count, shifted };
      },
      { base },
    );
    return (
      <div>
        <p>
          count:{state.count} shifted:{state.shifted}
        </p>
        <button onClick={() => (state.count += 1)}>+1</button>
      </div>
    );
  }
  function Wrapper(): ReactElement {
    const [base, setBase] = useState(10);
    return (
      <div>
        <button onClick={() => setBase(20)}>base=20</button>
        <Demo base={base} />
      </div>
    );
  }
  const { container, root } = mount(<Wrapper />);
  expect(container.querySelector("p")?.textContent).toBe(
    "count:10 shifted:0",
  );

  // 父组件驱动 props 变化：本次 render 内同步进 reactive props。
  // setup 只跑一次：count 是初值快照（10）不回填；computed 读到新 base。
  click(container, "base=20");
  expect(container.querySelector("p")?.textContent).toBe(
    "count:10 shifted:-10",
  );

  // 内部写入仍然独立工作
  click(container, "+1");
  await flush();
  expect(container.querySelector("p")?.textContent).toBe(
    "count:11 shifted:-9",
  );
  unmount(root, container);
});

test("createSetup：工厂可复用于多个组件实例（状态彼此独立）", async () => {
  resetTxnForTest();
  const useCounter = createSetup((props: { base: number }) => {
    const count = ref(props.base);
    return { count };
  });
  function Demo({ id, base }: { id: string; base: number }): ReactElement {
    const state = useCounter({ base });
    return (
      <div data-id={id}>
        {id}:{state.count}
        <button onClick={() => (state.count += 1)}>+{id}</button>
      </div>
    );
  }
  const { container, root } = mount(
    <div>
      <Demo id="a" base={0} />
      <Demo id="b" base={100} />
    </div>,
  );
  expect(container.querySelector('[data-id="a"]')?.textContent).toContain("a:0");
  expect(container.querySelector('[data-id="b"]')?.textContent).toContain(
    "b:100",
  );

  click(container, "+a");
  await flush();
  expect(container.querySelector('[data-id="a"]')?.textContent).toContain(
    "a:1",
  );
  // b 实例状态不受影响
  expect(container.querySelector('[data-id="b"]')?.textContent).toContain(
    "b:100",
  );
  unmount(root, container);
});

test("useSetup：生命周期挂接与卸载释放", async () => {
  resetTxnForTest();
  const calls: string[] = [];
  function Demo(): ReactElement {
    const state = useSetup(() => {
      const count = ref(0);
      onMounted(() => calls.push("mounted"));
      onUnmounted(() => calls.push("unmounted"));
      return { count };
    });
    return <p>{state.count}</p>;
  }
  const { container, root } = mount(<Demo />);
  expect(calls).toEqual(["mounted"]);

  unmount(root, container);
  await flush();
  expect(calls).toEqual(["mounted", "unmounted"]);
});

test("useSetup：StrictMode 双挂载下状态保留、mounted 只触发一次", async () => {
  resetTxnForTest();
  const calls: string[] = [];
  let setupRuns = 0;
  function Demo(): ReactElement {
    const state = useSetup(() => {
      setupRuns += 1;
      const count = ref(0);
      onMounted(() => calls.push("mounted"));
      onUnmounted(() => calls.push("unmounted"));
      return { count };
    });
    return (
      <div>
        <p>{state.count}</p>
        <button onClick={() => (state.count += 1)}>+1</button>
      </div>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <React.StrictMode>
        <Demo />
      </React.StrictMode>,
    );
  });
  await flush();
  // StrictMode 的 mount→unmount→mount：延迟 dispose 复查保证钩子与状态不丢
  expect(calls).toEqual(["mounted"]);
  expect(setupRuns).toBe(1);

  click(container, "+1");
  await flush();
  expect(container.querySelector("p")?.textContent).toBe("1");

  act(() => {
    root.unmount();
  });
  await flush();
  expect(calls).toEqual(["mounted", "unmounted"]);
  container.remove();
});

test("useSetup：在 defineComponent 的 setup 内使用时挂接父实例（provide/inject 连通）", async () => {
  resetTxnForTest();
  const { defineComponent } = await import("../src");
  const { provide, inject } = await import("../src/compat/instance");
  const { getCurrentInstance } = await import("../src/compat/instance");
  const injected: unknown[] = [];
  const Outer = defineComponent(() => {
    provide("theme", "dark");
    // useSetup 在 defineComponent 的 setup 内调用：实例应挂接当前实例为 parent
    const local = useSetup(() => {
      const instance = getCurrentInstance();
      injected.push(instance !== null ? "has-instance" : "no-instance");
      injected.push(inject("theme", "fallback"));
      const count = ref(0);
      return { count };
    });
    return () => (
      <div>
        <span>{local.count}</span>
      </div>
    );
  });
  const { container, root } = mount(<Outer />);
  expect(container.querySelector("span")?.textContent).toBe("0");
  expect(injected).toEqual(["has-instance", "dark"]);
  unmount(root, container);
});
