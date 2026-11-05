import { expect, test } from "rstack/test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPinia, defineStore, setActivePinia } from "pinia";
import { computed, ref } from "../src/index";
import { isShallow, nextTick, reactive, shallowReactive } from "../src/compat";
import { useSetup } from "../src/useSetup";

// pinia 内部 `import { ... } from "vue"` 经 rstack.config.ts 的 alias 指向 ./src/compat。
// 本文件验证目标：状态管理库 pinia（4.x，纯 reactivity + 实例上下文依赖）
// 在 React + compat 桥下真实可用（可行性评估 docs/PINIA-FEASIBILITY.md 的落地验证）。

setActivePinia(createPinia());

const useCounterStore = defineStore("counter-setup", () => {
  const count = ref(0);
  const double = computed(() => count.value * 2);
  function inc(): void {
    count.value++;
  }
  return { count, double, inc };
});

const useOptionsStore = defineStore("counter-options", {
  state: () => ({ n: 10 }),
  getters: {
    triple: (state) => state.n * 3,
  },
  actions: {
    setN(v: number): void {
      this.n = v;
    },
  },
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mount(element: React.ReactNode): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function cleanup(root: Root, container: HTMLDivElement): void {
  act(() => root.unmount());
  container.remove();
}

async function flushAsync(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

test("compat 导出 isShallow（pinia 唯一缺口）", () => {
  expect(typeof isShallow).toBe("function");
  expect(isShallow(reactive({ a: 1 }))).toBe(false);
  expect(isShallow(shallowReactive({ a: 1 }))).toBe(true);
});

test("pinia 经 compat alias 完成加载（ESM linking 无缺导出）", () => {
  expect(typeof useCounterStore).toBe("function");
  expect(typeof useOptionsStore).toBe("function");
  const store = useCounterStore();
  expect(store.count).toBe(0);
});

// React 组件经 useSetup 桥消费 store：useSetup 的 deep traverse effect
// 追踪 store 的响应式属性，变更后微任务触发组件级重渲染（§5.4 更新粒度）。
function SetupCounterDemo(): React.ReactNode {
  const { store } = useSetup(() => {
    const store = useCounterStore();
    return { store };
  });
  return (
    <div>
      <span>{store.count}</span>
      <span>{store.double}</span>
      <button onClick={() => store.inc()}>inc</button>
    </div>
  );
}

function OptionsCounterDemo(): React.ReactNode {
  const { store } = useSetup(() => {
    const store = useOptionsStore();
    return { store };
  });
  return (
    <div>
      <span>{store.n}</span>
      <span>{store.triple}</span>
      <button onClick={() => store.setN(21)}>set</button>
    </div>
  );
}

function SetupCounterMirror(): React.ReactNode {
  const { store } = useSetup(() => {
    const store = useCounterStore();
    return { store };
  });
  return (
    <div>
      <span>{store.count}</span>
      <button onClick={() => store.inc()}>inc-mirror</button>
    </div>
  );
}

test("setup 式 defineStore：state/getter/action 在 React 组件内工作", async () => {
  const { container, root } = mount(<SetupCounterDemo />);
  const spans = container.querySelectorAll("span");
  expect(spans[0]?.textContent).toBe("0");
  expect(spans[1]?.textContent).toBe("0");
  const button = container.querySelector("button");
  // action 写 ref → useSetup traverse effect 微任务 setTick → 重渲染。
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const after = container.querySelectorAll("span");
  expect(after[0]?.textContent).toBe("1");
  expect(after[1]?.textContent).toBe("2");
  cleanup(root, container);
});

test("options 式 defineStore：state 探测/getters/actions 在 React 组件内工作", async () => {
  const { container, root } = mount(<OptionsCounterDemo />);
  const spans = container.querySelectorAll("span");
  expect(spans[0]?.textContent).toBe("10");
  expect(spans[1]?.textContent).toBe("30");
  const button = container.querySelector("button");
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const after = container.querySelectorAll("span");
  expect(after[0]?.textContent).toBe("21");
  expect(after[1]?.textContent).toBe("63");
  cleanup(root, container);
});

test("store 实例缓存：跨组件同一实例且状态互通", async () => {
  // pinia store 是模块级缓存，换新 pinia 隔离其他用例留下的状态。
  setActivePinia(createPinia());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <div>
        <SetupCounterDemo />
        <SetupCounterMirror />
      </div>,
    ),
  );
  const buttons = container.querySelectorAll("button");
  expect(buttons.length).toBe(2);
  await act(async () => {
    buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // 镜像组件未触发任何点击，仅因共享同一 store 实例而反映更新。
  // spans 顺序：demo 的 count/double，mirror 的 count。
  const counts = container.querySelectorAll("span");
  expect(counts[0]?.textContent).toBe("1");
  expect(counts[2]?.textContent).toBe("1");

  cleanup(root, container);
});

test("store 定义重复调用返回同一实例（pinia 内部缓存）", () => {
  expect(useCounterStore()).toBe(useCounterStore());
  expect(useOptionsStore()).toBe(useOptionsStore());
});

test("$subscribe 在 action 修改 state 后触发", async () => {
  const store = useCounterStore();
  const seen: number[] = [];
  const stopSubscribe = store.$subscribe(() => {
    seen.push(store.count);
  });
  store.inc();
  await flushAsync();
  stopSubscribe();
  expect(seen.length).toBeGreaterThan(0);
  expect(seen[seen.length - 1]).toBe(store.count);
});

test("无组件上下文时调用 store 走 activePinia 回退（不抛错）", () => {
  setActivePinia(createPinia());
  const store = useOptionsStore();
  expect(store.n).toBe(10);
  store.setN(11);
  expect(store.n).toBe(11);
  store.setN(10);
});
