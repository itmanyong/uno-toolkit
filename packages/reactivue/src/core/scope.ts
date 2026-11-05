import { effectScope } from "@vue/reactivity";
import type { EffectScope } from "@vue/reactivity";

export type LifecycleHook =
  | "beforeMount"
  | "mounted"
  | "beforeUpdate"
  | "updated"
  | "beforeUnmount"
  | "unmounted";

export type HookBag = Record<LifecycleHook, Array<() => void>>;

export interface ReactivueInstance<P extends object = object> {
  readonly id: number;
  readonly scope: EffectScope;
  /** 内部可写的 reactive props；交给 setup 的是 readonly 视图。 */
  readonly props: P;
  readonly hooks: HookBag;
  readonly provides: Map<string | symbol, unknown>;
  readonly parent: ReactivueInstance | null;
  /** StrictMode 的 mount→unmount→mount 判定，见 useHostInstance。 */
  mounted: boolean;
  disposed: boolean;
}

const createHooks = (): HookBag => ({
  beforeMount: [],
  mounted: [],
  beforeUpdate: [],
  updated: [],
  beforeUnmount: [],
  unmounted: [],
});

let currentInstance: ReactivueInstance | null = null;
const stack: ReactivueInstance[] = [];
let sequence = 0;

export function createInstance<P extends object>(
  props: P,
  parent: ReactivueInstance | null = null,
): ReactivueInstance<P> {
  return {
    id: ++sequence,
    scope: effectScope(true),
    props,
    hooks: createHooks(),
    provides: new Map<string | symbol, unknown>(),
    parent,
    mounted: false,
    disposed: false,
  };
}

/** 在实例作用域内同步执行 setup，使 effect / computed / onScopeDispose 归属该 scope。 */
export function withInstance<T>(instance: ReactivueInstance, fn: () => T): T {
  const previous = currentInstance;
  stack.push(instance);
  currentInstance = instance;
  try {
    return instance.scope.run(fn) as T;
  } finally {
    stack.pop();
    currentInstance = stack.length > 0 ? stack[stack.length - 1]! : previous;
  }
}

export function getCurrentInstance(): ReactivueInstance | null {
  return currentInstance;
}

export function registerHook(hook: LifecycleHook, fn: () => void): void {
  const instance = getCurrentInstance();
  if (instance === null) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn(
        `[reactivue] ${hook}() 只能在 setup 同步执行期间调用，已忽略。`,
      );
    }
    return;
  }
  instance.hooks[hook].push(fn);
}

export function runHooks(instance: ReactivueInstance, hook: LifecycleHook): void {
  for (const fn of instance.hooks[hook]) {
    try {
      fn();
    } catch (error) {
      console.error(`[reactivue] ${hook} 钩子执行失败`, error);
    }
  }
}

export function disposeInstance(instance: ReactivueInstance): void {
  if (instance.disposed) return;
  instance.scope.stop();
  runHooks(instance, "unmounted");
  for (const key of Object.keys(instance.hooks) as LifecycleHook[]) {
    instance.hooks[key].length = 0;
  }
  instance.provides.clear();
  instance.disposed = true;
}

export function provideValue(key: string | symbol, value: unknown): void {
  const instance = getCurrentInstance();
  if (instance === null) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn("[reactivue] provide() 只能在 setup 同步执行期间调用，已忽略。");
    }
    return;
  }
  instance.provides.set(key, value);
}

export function injectValue<T>(key: string | symbol, fallback?: T): T | undefined {
  let instance = getCurrentInstance();
  while (instance !== null) {
    if (instance.provides.has(key)) {
      return instance.provides.get(key) as T;
    }
    instance = instance.parent;
  }
  return fallback;
}
