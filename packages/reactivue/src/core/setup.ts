import {
  pauseTracking,
  reactive,
  readonly,
  resetTracking,
} from "@vue/reactivity";
import type { ReactNode } from "react";
import { createInstance, withInstance } from "./scope";
import type { ReactivueInstance } from "./scope";

export type RenderThunk = () => ReactNode;
export type SetupResult = ReactNode | RenderThunk | { render: RenderThunk };
export type Setup<P extends object> = (props: Readonly<P>) => SetupResult;

export interface HostInstance<P extends object> {
  readonly instance: ReactivueInstance<P>;
  /** 可重复求值、不重跑 setup 的渲染 thunk。 */
  readonly render: RenderThunk;
  /** 是否来自编译产物（setup 返回 { render }）。 */
  readonly compiled: boolean;
}

let setupCallCount = 0;

export function getSetupCallCount(): number {
  return setupCallCount;
}

export function resetSetupCallCount(): void {
  setupCallCount = 0;
}

function isCompiledResult(result: SetupResult): result is { render: RenderThunk } {
  return (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    "render" in result &&
    typeof (result as { render?: unknown }).render === "function"
  );
}

function normalizeSetupResult(result: SetupResult): {
  render: RenderThunk;
  compiled: boolean;
} {
  if (isCompiledResult(result)) return { render: result.render, compiled: true };
  if (typeof result === "function") {
    return { render: result as RenderThunk, compiled: false };
  }
  // 未编译且直接返回 JSX：表达式已在 setup 时求值成常量，无法重新计算。
  const staticNode = result as ReactNode;
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.warn(
      "[reactivue] setup 返回了静态 JSX 且未启用编译插件，该组件不会响应式更新。" +
        "请返回 () => JSX，或注册 @uno-pc/reactivue/vite（/rsbuild）插件。",
    );
  }
  return { render: () => staticNode, compiled: false };
}

export function createHostInstance<P extends object>(
  reactProps: P,
  setup: Setup<P>,
  parent: ReactivueInstance | null = null,
): HostInstance<P> {
  const props = reactive({ ...reactProps }) as unknown as P;
  const instance = createInstance(props, parent);
  const readonlyProps = readonly(props) as unknown as Readonly<P>;
  setupCallCount += 1;
  const result = withInstance(instance, () => setup(readonlyProps));
  const { render, compiled } = normalizeSetupResult(result);
  return { instance, render, compiled };
}

/** 在 useLayoutEffect 中调用：commit 后、paint 前同步 props，满足 React purity。 */
export function syncProps<P extends object>(
  instance: ReactivueInstance<P>,
  next: P,
): void {
  const target = instance.props;
  pauseTracking();
  try {
    for (const key of Object.keys(next) as Array<keyof P & string>) {
      if (!Object.is(target[key], next[key])) target[key] = next[key];
    }
    for (const key of Object.keys(target) as Array<keyof P & string>) {
      if (!(key in next)) Reflect.deleteProperty(target as object, key);
    }
  } finally {
    resetTracking();
  }
}
