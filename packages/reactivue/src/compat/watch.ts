import {
  effect,
  stop,
  watch as reactivityWatch,
} from "@vue/reactivity";

export const watch: typeof reactivityWatch = reactivityWatch;

/**
 * `@vue/reactivity` 3.5.x 未导出 watchEffect（且裸 watch 无 flush 选项），
 * 这里用 effect + stop 兜底：立即执行一次，依赖变化同步重跑。
 */
export function watchEffect(source: () => void): () => void {
  const runner = effect(source);
  return () => stop(runner);
}
