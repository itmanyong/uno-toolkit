import * as React from "react";
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactElement, ReactNode } from "react";
import { effect, stop } from "@vue/reactivity";
import type { ReactiveEffectRunner } from "@vue/reactivity";
import { runHooks } from "../core/scope";
import { cancelBlock, onCommitDone, scheduleBlock } from "../core/txn";
import type { BlockCell } from "../core/txn";
import { InstanceContext, RevisionContext } from "./context";

export interface BlockProps {
  render: () => ReactNode;
  revision?: number;
  groupKey?: string;
  /** 编译期可为纯表达式块生成指纹，用于抑制假阳性重渲染。 */
  fingerprint?: () => unknown;
}

interface BlockStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
  bump: () => void;
}

function createBlockStore(): BlockStore {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): number {
      return version;
    },
    getServerSnapshot(): number {
      return 0;
    },
    bump(): void {
      version += 1;
      for (const listener of listeners) listener();
    },
  };
}

/** 结构通道：一个 Block 一个 fiber，依赖变化只重渲染该块。 */
export function Block({
  render,
  revision = 0,
  groupKey,
  fingerprint,
}: BlockProps): ReactElement {
  const renderRef = useRef<() => ReactNode>(render);
  renderRef.current = render;
  const fingerprintRef = useRef<(() => unknown) | undefined>(fingerprint);
  fingerprintRef.current = fingerprint;
  const instance = useContext(InstanceContext);
  const store = useMemo<BlockStore>(createBlockStore, []);
  const runnerRef = useRef<ReactiveEffectRunner | null>(null);
  const cellRef = useRef<BlockCell | null>(null);
  // 首次 commit 不算「更新」：onUpdated 语义对齐 Vue（mount 不触发）。
  const hasCommittedRef = useRef(false);

  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  if (cellRef.current === null) {
    cellRef.current = {
      bump: () => store.bump(),
      getRunner: () => runnerRef.current,
      groupKey,
      alive: true,
    };
  }
  const cell = cellRef.current;
  cell.groupKey = groupKey;
  cell.alive = true;
  cell.fingerprint = fingerprintRef.current
    ? () => fingerprintRef.current?.()
    : undefined;

  // 无依赖数组：每次重渲染重建 effect，支持动态依赖切换。
  useLayoutEffect(() => {
    // cleanup 在本次 commit 的 layout 阶段刚把 alive 置 false；
    // 新 effect 已重建，必须在此恢复存活，否则后续 trigger 会被
    // flush 的 alive 过滤丢弃（render phase 到来前自锁）。cleanup
    // 与 setup 同步相邻，窗口内不会插入 flush 微任务。
    cell.alive = true;
    const runner = effect(() => renderRef.current(), {
      scheduler: () => {
        // trigger 发生在块更新链路起点（flush → bump → commit 之前），
        // 此处触发 beforeUpdate，与 commit 阶段的 updated 成对。
        if (instance !== null && hasCommittedRef.current) {
          runHooks(instance, "beforeUpdate");
        }
        scheduleBlock(cell);
      },
    });
    runnerRef.current = runner;
    // 首次 commit 是 mount，不算更新；此后每次块 commit 触发 updated。
    if (instance !== null && hasCommittedRef.current) {
      runHooks(instance, "updated");
    }
    hasCommittedRef.current = true;
    onCommitDone(cell);
    return () => {
      stop(runner);
      runnerRef.current = null;
      cell.alive = false;
      cancelBlock(cell);
    };
  });

  return (
    <RevisionContext.Provider value={revision}>
      <>{renderRef.current()}</>
    </RevisionContext.Provider>
  );
}
