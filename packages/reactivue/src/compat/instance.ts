import {
  getCurrentInstance as getScopeInstance,
  injectValue,
  provideValue,
} from "../core/scope";
import type { ReactivueInstance } from "../core/scope";

/** 精简实例元信息：不是 Vue 组件实例，没有 proxy / ctx / emit。 */
export interface CompatInstance {
  readonly id: number;
  readonly provides: Map<string | symbol, unknown>;
  readonly parent: CompatInstance | null;
}

function toCompat(instance: ReactivueInstance): CompatInstance {
  return {
    id: instance.id,
    provides: instance.provides,
    parent: instance.parent ? toCompat(instance.parent) : null,
  };
}

export function getCurrentInstance(): CompatInstance | null {
  const instance = getScopeInstance();
  return instance === null ? null : toCompat(instance);
}

export function inject<T>(key: string | symbol, fallback?: T): T | undefined {
  return injectValue<T>(key, fallback);
}

export function provide(key: string | symbol, value: unknown): void {
  provideValue(key, value);
}

export function nextTick(fn?: () => void): Promise<void> {
  return Promise.resolve().then(fn);
}
