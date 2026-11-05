import { isServer } from "../shared/env";
import { toText } from "../shared/to-text";

/**
 * 统一事务调度器（设计 §15.3）。
 *
 * 文本与结构通道共用带 scheduler 的 effect；所有 scheduler 在同一同步栈的
 * endBatch() 中调用完毕，微任务 flush 时已收齐本次写入命中的全部通道：
 *   - 仅文本 → 零 React 快路径，Object.is 抑制后直写 nodeValue
 *   - 含结构块 → 文本挂起，等结构块 commit 的 layout effect 同帧落地
 *
 * P-B：granularity='coarse' 时同 groupKey 的结构块合并为一次 bump；
 * 结构块若提供 fingerprint，值未变则整块跳过（假阳性抑制）。
 */

export type Granularity = "fine" | "balanced" | "coarse";

export interface TextCell {
  /** 求值（不收集依赖，依赖由 effect 的 runner 收集）。 */
  read: () => unknown;
  write: (text: string) => void;
  /** effect() 返回的 runner，用于重建 deps 集合。 */
  runner: () => unknown;
  last: unknown;
  alive: boolean;
}

export interface BlockCell {
  bump: () => void;
  /** 必须是取值器：Block 每次重渲染都会重建 effect。 */
  getRunner: () => (() => unknown) | null;
  /** 可选的结构指纹，用于抑制「迭代键变化但输出未变」的假阳性。 */
  fingerprint?: () => unknown;
  lastFingerprint?: unknown;
  hasFingerprint?: boolean;
  /** coarse 模式下同组块只 bump 一次。 */
  groupKey?: string;
  alive: boolean;
}

interface Epoch {
  readonly id: number;
  texts: Set<TextCell>;
  blocks: Map<string, BlockCell>;
  aligned: Array<() => void>;
  waiting: Set<BlockCell>;
  settled: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

let granularity: Granularity = "balanced";
let current: Epoch | null = null;
let scheduled = false;
let epochSequence = 0;
let cellSequence = 0;
const cellKeys = new WeakMap<BlockCell, string>();

export function configureTxn(options: { granularity?: Granularity }): void {
  if (options.granularity) granularity = options.granularity;
}

export function getGranularity(): Granularity {
  return granularity;
}

function blockKey(cell: BlockCell): string {
  if (granularity === "coarse" && cell.groupKey) {
    return `group:${cell.groupKey}`;
  }
  let key = cellKeys.get(cell);
  if (key === undefined) {
    key = `cell:${++cellSequence}`;
    cellKeys.set(cell, key);
  }
  return key;
}

function epoch(): Epoch {
  if (current === null) {
    current = {
      id: ++epochSequence,
      texts: new Set<TextCell>(),
      blocks: new Map<string, BlockCell>(),
      aligned: [],
      waiting: new Set<BlockCell>(),
      settled: false,
    };
  }
  return current;
}

function scheduleFlush(): void {
  if (scheduled || isServer) return;
  scheduled = true;
  queueMicrotask(flush);
}

export function scheduleText(cell: TextCell): void {
  if (isServer) return;
  epoch().texts.add(cell);
  scheduleFlush();
}

export function scheduleBlock(cell: BlockCell): void {
  if (isServer) return;
  const target = epoch();
  const key = blockKey(cell);
  if (!target.blocks.has(key)) target.blocks.set(key, cell);
  scheduleFlush();
}

/** 供 v-memo deps 变化等非 Vue trigger 路径注入同一事务。 */
export function scheduleRevision(texts: TextCell[], blocks: BlockCell[]): void {
  for (const cell of texts) scheduleText(cell);
  for (const cell of blocks) scheduleBlock(cell);
}

function safeCall(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    console.error("[reactivue] 依赖重收集失败", error);
  }
}

function makeTextTask(cell: TextCell): () => void {
  return () => {
    if (!cell.alive) return;
    const value = cell.read();
    if (Object.is(value, cell.last)) return;
    cell.last = value;
    cell.write(toText(value));
  };
}

function settle(target: Epoch): void {
  if (target.settled) return;
  const tasks = target.aligned;
  target.aligned = [];
  target.waiting.clear();
  target.settled = true;
  pendingEpochs.delete(target);
  if (target.timer !== undefined) clearTimeout(target.timer);
  for (const task of tasks) task();
}

function scheduleFallback(target: Epoch): void {
  // 极端兜底：结构块被并发渲染丢弃时 onCommitDone 可能永不触发。
  target.timer = setTimeout(() => {
    if (!target.settled) {
      if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
        console.warn(
          "[reactivue] 结构块未在预期时间内 commit，文本写入已强制落地以避免饿死。",
        );
      }
      settle(target);
    }
  }, 250);
}

function flush(): void {
  scheduled = false;
  const target = current;
  current = null;
  if (target === null || target.settled) return;

  const texts = [...target.texts].filter((cell) => cell.alive);
  const blocks = [...target.blocks.values()].filter((cell) => cell.alive);

  // 带 scheduler 时 Vue 不会自动 run()，必须显式重收集依赖。
  for (const cell of texts) safeCall(cell.runner);
  for (const cell of blocks) {
    const runner = cell.getRunner();
    if (runner !== null) safeCall(runner);
  }

  const changed: BlockCell[] = [];
  for (const cell of blocks) {
    if (cell.fingerprint) {
      let next: unknown;
      try {
        next = cell.fingerprint();
      } catch (error) {
        console.error("[reactivue] 结构指纹求值失败", error);
        next = undefined;
      }
      if (cell.hasFingerprint && Object.is(next, cell.lastFingerprint)) continue;
      cell.lastFingerprint = next;
      cell.hasFingerprint = true;
    }
    changed.push(cell);
  }

  if (changed.length === 0) {
    for (const cell of texts) makeTextTask(cell)();
    target.settled = true;
    return;
  }

  target.aligned = texts.map(makeTextTask);
  target.waiting = new Set(changed);
  pendingEpochs.add(target);
  for (const cell of changed) cell.bump();
  scheduleFallback(target);
}

/** Block 在自己的 layout effect（commit 后、paint 前）中调用。 */
export function onCommitDone(cell: BlockCell): void {
  for (const target of waitingEpochs(cell)) {
    target.waiting.delete(cell);
    if (target.waiting.size === 0) settle(target);
  }
}

/** 结构块卸载时调用，避免 pendingCommit 永不归零导致文本饿死。 */
export function cancelBlock(cell: BlockCell): void {
  onCommitDone(cell);
}

// 一个 epoch 进入 aligned 阶段后会脱离 current，需要保留弱引用以便回调命中。
const pendingEpochs = new Set<Epoch>();

function waitingEpochs(cell: BlockCell): Epoch[] {
  const result: Epoch[] = [];
  for (const target of pendingEpochs) {
    if (!target.settled && target.waiting.has(cell)) result.push(target);
  }
  return result;
}

/** 测试隔离：清空所有挂起事务与定时器。 */
export function resetTxnForTest(): void {
  for (const target of pendingEpochs) {
    if (target.timer !== undefined) clearTimeout(target.timer);
  }
  pendingEpochs.clear();
  current = null;
  scheduled = false;
  granularity = "balanced";
  epochSequence = 0;
  cellSequence = 0;
}
