// Vue 官方响应式 API 原样 re-export，`.value` 语义不做包装。
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
} from "@vue/reactivity";

export {
  defineComponent,
  createCompiledHost,
  useHostInstance,
} from "./react/Host";
export { Block } from "./react/Block";
export { MemoBlock } from "./react/MemoBlock";
export { TextBinding } from "./react/TextBinding";
export {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
} from "./react/lifecycle";
export { useSetup, createSetup } from "./useSetup";
export type { UnwrapRef } from "./useSetup";
export { configureTxn, getGranularity } from "./core/txn";
export type { Granularity } from "./core/txn";
export type {
  BlockCell,
  BlockProps,
  DefineComponentOptions,
  HostInstance,
  LifecycleHook,
  MemoBlockProps,
  ReactivueInstance,
  RenderThunk,
  Setup,
  SetupResult,
  TextBindingProps,
  TextCell,
} from "./types";
