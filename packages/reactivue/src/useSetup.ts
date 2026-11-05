import { useEffect, useRef, useState } from "react";
import { effect, proxyRefs, reactive, readonly, stop } from "@vue/reactivity";
import type { Ref } from "@vue/reactivity";
import {
  createInstance,
  disposeInstance,
  getCurrentInstance,
  runHooks,
  withInstance,
} from "./core/scope";
import type { ReactivueInstance } from "./core/scope";

/**
 * setup 返回值的浅层 ref 解包：`Ref<T>` 属性访问时直接得到 `T`（经 proxyRefs）。
 * 嵌套对象内的 ref 不解包，与设计 §5.4 的签名语义一致。
 */
export type UnwrapRef<S> = {
  [K in keyof S]: S[K] extends Ref<infer V> ? V : S[K];
};

/** 深度触达响应式状态的所有属性，收集组件级重渲染桥的依赖。 */
function traverse(value: unknown, seen: Set<object>): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) traverse(item, seen);
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    traverse((value as Record<string, unknown>)[key], seen);
  }
}

/**
 * 在普通 React 函数组件内使用组合式 API（设计 §5.4）。
 *
 * - setup 只执行一次（useRef 惰性初始化），在独立实例作用域内运行：
 *   setup 内的 watch / computed 归属该 scope，卸载时随 disposeInstance 释放。
 * - 返回值经 proxyRefs 解包：模板里直接读写 `state.count`（等价 count.value）。
 * - props 桥：reactive props 在 render 阶段幂等同步，依赖 props 的 computed
 *   在本次 render 即读到新值；props 变化的重渲染由 React 父组件驱动。
 * - 响应式写入（事件回调里改 ref）不经过 React：deep traverse effect 在
 *   微任务中 setTick 触发一次组件级重渲染（本 API 的更新粒度，见文档）。
 * - 生命周期与 useHostInstance 同款：StrictMode 微任务复查后再 dispose。
 *
 * 注意：本 API 的更新粒度是组件级重渲染，不享受编译期切块的细粒度更新。
 */
export function useSetup<
  S extends Record<string, unknown>,
  P extends object = Record<string, never>,
>(setup: (props: Readonly<P>) => S, reactProps?: P): UnwrapRef<S> {
  const stateRef = useRef<{
    instance: ReactivueInstance<P>;
    unwrapped: UnwrapRef<S>;
  } | null>(null);
  if (stateRef.current === null) {
    const props = reactive({ ...(reactProps ?? ({} as P)) }) as P;
    // parent 挂接当前实例（若 useSetup 出现在 defineComponent 的 setup 内，
    // provide/inject 链路保持连通）。
    const instance = createInstance(props, getCurrentInstance());
    const state = withInstance(instance, () =>
      setup(readonly(props) as Readonly<P>),
    );
    stateRef.current = {
      instance,
      unwrapped: proxyRefs(state) as UnwrapRef<S>,
    };
  }
  const { instance, unwrapped } = stateRef.current;

  // props 桥：render 阶段幂等同步。这里刻意不走 useLayoutEffect——
  // useSetup 没有块订阅 props，必须让本次 render 直接读到新 props，
  // 否则 computed(props) 的输出会滞后一个 commit。trigger 链路均入微任务，
  // 不会在 render 栈内引发 setState。
  const latestProps = useRef(reactProps);
  latestProps.current = reactProps;
  if (reactProps !== undefined) {
    const target = instance.props as Record<string, unknown>;
    const source = reactProps as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      if (!Object.is(target[key], source[key])) target[key] = source[key];
    }
  }

  // 组件级重渲染桥：state 任意响应式变化 → 微任务 setTick → 整组件重渲染。
  const [, setTick] = useState(0);
  useEffect(() => {
    const runner = effect(
      () => traverse(unwrapped, new Set()),
      {
        scheduler: () => {
          queueMicrotask(() => setTick((tick) => tick + 1));
        },
      },
    );
    return () => {
      stop(runner);
    };
  }, [unwrapped]);

  // 生命周期桥：与 useHostInstance 同款（StrictMode 微任务复查 dispose）。
  // mounted 钩子一次性：StrictMode 的 mount→unmount→mount 不重复触发。
  const mountedFired = useRef(false);
  useEffect(() => {
    // mounted 标志每次挂载都要置回：StrictMode 重挂后 dispose 复查依赖它。
    instance.mounted = true;
    if (!mountedFired.current) {
      mountedFired.current = true;
      runHooks(instance, "beforeMount");
      runHooks(instance, "mounted");
    }
    return () => {
      instance.mounted = false;
      runHooks(instance, "beforeUnmount");
      queueMicrotask(() => {
        if (!instance.mounted && !instance.disposed) disposeInstance(instance);
      });
    };
  }, [instance]);

  return unwrapped;
}

/**
 * 把 setup 工厂转换为「传 props 即得响应式状态」的 hook 形式，
 * 便于在多个 React 组件间复用同一段组合式逻辑。
 *
 * ```tsx
 * const useCounter = createSetup((props: { base: number }) => {
 *   const count = ref(props.base);
 *   const doubled = computed(() => count.value * 2);
 *   return { count, doubled };
 * });
 *
 * function Demo({ base }: { base: number }) {
 *   const { count, doubled } = useCounter({ base });
 *   return <button onClick={() => (count.value += 1)}>{doubled.value}</button>;
 * }
 * ```
 */
export function createSetup<
  S extends Record<string, unknown>,
  P extends object = Record<string, never>,
>(setup: (props: P) => S): (props: P) => UnwrapRef<S> {
  return (props: P) => useSetup(setup, props);
}
