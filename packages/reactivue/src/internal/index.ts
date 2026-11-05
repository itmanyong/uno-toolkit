/**
 * 编译产物专用入口（评审决议第 5 条：独立 exports 子路径）。
 * 这里导出的符号不承诺稳定性，仅供本包插件生成的代码使用。
 */
export { TextBinding } from "../react/TextBinding";
export { Block } from "../react/Block";
export { MemoBlock } from "../react/MemoBlock";
export {
  createCompiledHost,
  useHostInstance,
} from "../react/Host";
export {
  configureTxn,
  getGranularity,
  scheduleRevision,
} from "../core/txn";
export { getCurrentInstance } from "../core/scope";
export type { Granularity } from "../core/txn";
