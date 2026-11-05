/**
 * `vue` / `@vue/runtime-dom` 的 alias 目标。
 * 目标：让 VueUse 这类纯组合式函数库可在 React 中直接复用。
 * 注意：这里的 defineComponent 是 Vue 语义的 identity 函数，与主入口同名不同义。
 */
export {
  ref,
  shallowRef,
  isRef,
  toRef,
  toRefs,
  toValue,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  computed,
  effect,
  stop,
  enableTracking,
  pauseTracking,
  resetTracking,
  ReactiveEffect,
  effectScope,
  EffectScope,
  getCurrentScope,
  onScopeDispose,
  onWatcherCleanup,
} from "@vue/reactivity";
export { watch, watchEffect } from "./watch";
export {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
} from "../react/lifecycle";
export {
  getCurrentInstance,
  inject,
  provide,
  nextTick,
} from "./instance";
// 下方 hasInjectionContext 需要本地绑定（转发导出不会把名字引入作用域）。
import { getCurrentInstance } from "./instance";

export function defineComponent<T>(options: T): T {
  return options;
}

/** Vue 3.3+：compat 层存在实例上下文即视为 true。 */
export function hasInjectionContext(): boolean {
  return getCurrentInstance() !== null;
}

/**
 * 占位组件：VueUse 的列表渲染辅助（renderList）在 transition 分支才用到它，
 * React 下不会走到；补齐导出仅为让 ESM linking 通过。
 */
export function TransitionGroup(): null {
  return null;
}

export function onActivated(): void {
  // Vue 的 KeepAlive 语义不适用，静默 no-op。
}

export function onDeactivated(): void {
  // Vue 的 KeepAlive 语义不适用，静默 no-op。
}

export function h(...args: unknown[]): unknown {
  return args;
}

export const Fragment: unique symbol = Symbol("reactivue.Fragment");
export const Text: unique symbol = Symbol("reactivue.Text");
export const Comment: unique symbol = Symbol("reactivue.Comment");
