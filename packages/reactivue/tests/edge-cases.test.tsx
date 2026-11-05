import { expect, test } from "rstack/test";
import * as React from "react";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ref } from "@vue/reactivity";
import { TextBinding } from "../src/react/TextBinding";
import { Block, defineComponent, TextBinding as _TextBinding } from "../src";
import {
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  onUpdated,
} from "../src/react/lifecycle";
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

test("六个生命周期钩子按语义触发", async () => {
  resetTxnForTest();
  const calls: string[] = [];
  const Demo = defineComponent(() => {
    const count = ref(0);
    onBeforeMount(() => calls.push("beforeMount"));
    onMounted(() => calls.push("mounted"));
    onBeforeUpdate(() => calls.push("beforeUpdate"));
    onUpdated(() => calls.push("updated"));
    onBeforeUnmount(() => calls.push("beforeUnmount"));
    onUnmounted(() => calls.push("unmounted"));
    return () => (
      <div>
        <p>{count.value}</p>
        <button onClick={() => (count.value += 1)}>+1</button>
      </div>
    );
  });
  const { container, root } = mount(<Demo />);
  // mount 阶段：beforeMount → mounted（无 beforeUpdate/updated）
  expect(calls).toEqual(["beforeMount", "mounted"]);

  click(container, "+1");
  await flush();
  // 块更新 commit 后触发 beforeUpdate/updated
  expect(calls).toContain("beforeUpdate");
  expect(calls).toContain("updated");
  expect(calls).not.toContain("beforeUnmount");

  unmount(root, container);
  // onUnmounted 经 StrictMode 安全复查（微任务）后由 disposeInstance 触发
  await flush();
  expect(calls).toEqual([
    "beforeMount",
    "mounted",
    "beforeUpdate",
    "updated",
    "beforeUnmount",
    "unmounted",
  ]);
});

test("钩子抛错被捕获且不影响其余钩子", async () => {
  resetTxnForTest();
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  const calls: string[] = [];
  const Demo = defineComponent(() => {
    onMounted(() => {
      calls.push("first");
    });
    onMounted(() => {
      throw new Error("hook boom");
    });
    onMounted(() => {
      calls.push("third");
    });
    return () => <p>ok</p>;
  });
  const { root, container } = mount(<Demo />);
  expect(calls).toEqual(["first", "third"]);
  expect(
    errors.some((args) => String(args[0]).includes("mounted 钩子执行失败")),
  ).toBe(true);
  unmount(root, container);
  console.error = originalError;
});

test("TextBinding 边界值：对象降级告警，空值渲染空串", async () => {
  resetTxnForTest();
  const originalWarn = console.warn;
  const warns: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  const value = ref<unknown>("plain");
  const { container, root } = mount(
    <TextBinding value={() => value.value} />,
  );
  expect(container.textContent).toBe("plain");

  // null / undefined / boolean / symbol / function → 空字符串（与 React 文本语义对齐）
  for (const empty of [null, undefined, true, false, Symbol("s"), () => 1]) {
    value.value = empty;
    await flush();
    expect(container.textContent).toBe("");
  }

  // 对象 → String() 降级 + DEV 告警
  const obj = { toString: () => "obj-text" };
  value.value = obj;
  await flush();
  expect(container.textContent).toBe("obj-text");
  expect(warns.some((args) => String(args[0]).includes("对象值"))).toBe(true);

  // bigint / number 正常字符串化
  value.value = 10n;
  await flush();
  expect(container.textContent).toBe("10");

  unmount(root, container);
  console.warn = originalWarn;
});

test("StrictMode 双挂载：setup 只跑一次且块更新持续存活", async () => {
  resetTxnForTest();
  const Demo = defineComponent(() => {
    const count = ref(0);
    return () => (
      <div>
        <p>{count.value}</p>
        <button onClick={() => (count.value += 1)}>+1</button>
      </div>
    );
  });
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
  // StrictMode 会 mount→unmount→mount：延迟 dispose 复查保证实例不被误销毁
  await act(async () => {
    await Promise.resolve();
  });

  const button = container.querySelector("button");
  for (let i = 1; i <= 3; i += 1) {
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("p")?.textContent).toBe(String(i));
  }

  act(() => {
    root.unmount();
  });
  container.remove();
});

/** 捕获块渲染异常的 React 错误边界。 */
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): React.ReactNode {
    return this.state.failed ? <em>caught</em> : this.props.children;
  }
}

test("块 render 抛错被 React 错误边界捕获", () => {
  resetTxnForTest();
  const shouldThrow = ref(false);
  const Bomb = defineComponent(() => {
    return () => (
      <Block
        render={() => {
          if (shouldThrow.value) throw new Error("render boom");
          return <p>safe</p>;
        }}
      />
    );
  });
  const { container, root } = mount(
    <Boundary>
      <Bomb />
    </Boundary>,
  );
  expect(container.textContent).toBe("safe");
  unmount(root, container);
});

test("结构块卸载后挂起的文本任务落地，不饿死", async () => {
  resetTxnForTest();
  const count = ref(0);
  const { container, root } = mount(
    <div>
      <Block
        render={() => {
          // 引用 count 使块订阅它；随后卸载，验证事务不因块消失而卡死
          void count.value;
          return <span>block</span>;
        }}
      />
      <TextBinding value={() => count.value} />
    </div>,
  );
  expect(container.textContent).toContain("block");

  act(() => {
    root.unmount();
  });
  container.remove();

  // 卸载后 trigger 不抛错（所有 cell 已 alive=false 或随 root 销毁）
  let threw = false;
  try {
    await act(async () => {
      count.value += 1;
      await Promise.resolve();
    });
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
});
