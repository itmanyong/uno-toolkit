import { registerHook } from "../core/scope";

export function onBeforeMount(fn: () => void): void {
  registerHook("beforeMount", fn);
}

export function onMounted(fn: () => void): void {
  registerHook("mounted", fn);
}

export function onBeforeUpdate(fn: () => void): void {
  registerHook("beforeUpdate", fn);
}

/** 注意：本包由「任一动态块完成更新」触发，不等价于 React 组件重渲染。 */
export function onUpdated(fn: () => void): void {
  registerHook("updated", fn);
}

export function onBeforeUnmount(fn: () => void): void {
  registerHook("beforeUnmount", fn);
}

export function onUnmounted(fn: () => void): void {
  registerHook("unmounted", fn);
}
