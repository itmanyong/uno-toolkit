import * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { effect, pauseTracking, resetTracking, stop } from "@vue/reactivity";
import { Block } from "./Block";

export interface MemoBlockProps {
  deps: () => unknown[];
  render: () => ReactNode;
  groupKey?: string;
  fingerprint?: () => unknown;
}

function sameDeps(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}

/**
 * v-memo 语义（额外触发源）：deps 逐项 Object.is 变化 → revision++，
 * 块内 Block 重渲染、TextBinding 重建 effect 并同步值。
 * 非 Vue 原语义（deps 不变时不会压制块内响应式更新）。
 */
export function MemoBlock({
  deps,
  render,
  groupKey,
  fingerprint,
}: MemoBlockProps): ReactElement {
  const [revision, setRevision] = useState<number>(0);
  const lastRef = useRef<unknown[] | null>(null);
  const depsRef = useRef<() => unknown[]>(deps);
  depsRef.current = deps;

  let nextDeps: unknown[];
  pauseTracking();
  try {
    nextDeps = depsRef.current();
  } finally {
    resetTracking();
  }

  useLayoutEffect(() => {
    if (lastRef.current === null) {
      lastRef.current = nextDeps;
      return;
    }
    if (!sameDeps(lastRef.current, nextDeps)) {
      lastRef.current = nextDeps;
      setRevision((value) => value + 1);
    }
  });

  // 「额外触发源」的通知通道：deps 中的响应式依赖（纯 ref、reactive props 等）
  // 不一定有 React 侧订阅者（deps 求值带 pauseTracking 且只发生在本组件 render 时），
  // 纯 ref deps 的变化若无此 effect 将永远不会触发刷新。这里显式订阅 deps 的响应式
  // 依赖，trigger 后推迟到微任务再比较——syncProps 在宿主 render 阶段写入 reactive
  // props 时会同步触发本 scheduler，若当场 setRevision 会命中 React 的
  // "setState during render of a different component" 警告；微任务已脱离渲染栈。
  // React 渲染路径上方的比较保留为兜底，两条路径经 lastRef 同步后幂等。
  useLayoutEffect(() => {
    const runner = effect(
      () => depsRef.current(),
      {
        scheduler: () => {
          queueMicrotask(() => {
            const next = depsRef.current();
            if (lastRef.current !== null && !sameDeps(lastRef.current, next)) {
              lastRef.current = next;
              setRevision((value) => value + 1);
            }
          });
        },
      },
    );
    return () => {
      stop(runner);
    };
  }, []);

  return (
    <Block
      render={render}
      revision={revision}
      groupKey={groupKey}
      fingerprint={fingerprint}
    />
  );
}
