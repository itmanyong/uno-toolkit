import { createContext } from "react";
import type { Context } from "react";
import type { ReactivueInstance } from "../core/scope";

/** 由 Host 提供，供 Block / 生命周期桥 / compat 层读取。 */
export const InstanceContext: Context<ReactivueInstance | null> =
  createContext<ReactivueInstance | null>(null);

/** MemoBlock 的 revision 透传给块内 TextBinding。 */
export const RevisionContext: Context<number> = createContext<number>(0);
