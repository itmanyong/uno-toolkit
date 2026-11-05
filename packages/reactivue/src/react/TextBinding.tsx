import * as React from "react";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  effect,
  pauseTracking,
  resetTracking,
  stop,
} from "@vue/reactivity";
import type { ReactiveEffectRunner } from "@vue/reactivity";
import { scheduleText } from "../core/txn";
import type { TextCell } from "../core/txn";
import { isServer } from "../shared/env";
import { toText } from "../shared/to-text";
import { RevisionContext } from "./context";

export interface TextBindingProps {
  value: () => unknown;
  revision?: number;
}

/**
 * 文本通道 T2：零 useSyncExternalStore、零 setState。
 * initial 永不变化，React 重渲染不会覆盖我们直写的 nodeValue。
 */
export function TextBinding({ value, revision }: TextBindingProps): ReactElement {
  const contextRevision = useContext(RevisionContext);
  const effectiveRevision = revision ?? contextRevision;
  const anchor = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<() => unknown>(value);
  valueRef.current = value;
  const cellRef = useRef<TextCell | null>(null);
  const runnerRef = useRef<ReactiveEffectRunner | null>(null);

  const [initial] = useState<string>(() => {
    pauseTracking();
    try {
      return toText(valueRef.current());
    } finally {
      resetTracking();
    }
  });

  useLayoutEffect(() => {
    if (isServer || typeof Text === "undefined") return;
    const node = anchor.current?.previousSibling ?? null;
    if (!(node instanceof Text)) return;

    if (cellRef.current === null) {
      cellRef.current = {
        read: () => valueRef.current(),
        write: (text: string) => {
          node.nodeValue = text;
        },
        runner: () => runnerRef.current?.(),
        last: initial,
        alive: true,
      };
    }
    const cell = cellRef.current;
    cell.alive = true;
    cell.last = initial;

    const runner = effect(() => valueRef.current(), {
      scheduler: () => scheduleText(cell),
    });
    runnerRef.current = runner;

    // 挂载 / revision 重建时同步一次，保证首屏与当前值一致。
    const current = cell.read();
    if (!Object.is(current, cell.last)) {
      cell.last = current;
      cell.write(toText(current));
    }

    return () => {
      stop(runner);
      runnerRef.current = null;
      cell.alive = false;
    };
  }, [effectiveRevision, initial]);

  return (
    <>
      {initial}
      <span ref={anchor} hidden data-rv-anchor="" />
    </>
  );
}
