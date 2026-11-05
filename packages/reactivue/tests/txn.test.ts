import { expect, test } from "rstack/test";
import {
  cancelBlock,
  configureTxn,
  getGranularity,
  onCommitDone,
  resetTxnForTest,
  scheduleBlock,
  scheduleRevision,
  scheduleText,
} from "../src/core/txn";
import type { BlockCell, TextCell } from "../src/core/txn";

function makeText(read: () => unknown, writes: string[]): TextCell {
  return {
    read,
    write: (text: string) => {
      writes.push(text);
    },
    runner: () => read(),
    last: undefined,
    alive: true,
  };
}

function makeBlock(
  bumps: string[],
  groupKey?: string,
  fingerprint?: () => unknown,
): BlockCell {
  return {
    bump: () => {
      bumps.push("bump");
    },
    getRunner: () => () => undefined,
    groupKey,
    fingerprint,
    hasFingerprint: false,
    alive: true,
  };
}

const tick = (): Promise<void> => Promise.resolve();

test("同 task 内 10 次写入合并成 1 次 DOM 写", async () => {
  resetTxnForTest();
  let value = 1;
  const writes: string[] = [];
  const cell = makeText(() => value, writes);
  for (let index = 2; index <= 11; index += 1) {
    value = index;
    scheduleText(cell);
  }
  await tick();
  expect(writes).toEqual(["11"]);
});

test("值未变化时完全不写 DOM", async () => {
  resetTxnForTest();
  const writes: string[] = [];
  const cell = makeText(() => "same", writes);
  cell.last = "same";
  scheduleText(cell);
  await tick();
  expect(writes).toEqual([]);
});

test("混合命中时文本挂起，结构块 commit 后同批落地", async () => {
  resetTxnForTest();
  const writes: string[] = [];
  const bumps: string[] = [];
  const text = makeText(() => "v", writes);
  const block = makeBlock(bumps);
  scheduleText(text);
  scheduleBlock(block);
  await tick();
  expect(bumps).toEqual(["bump"]);
  expect(writes).toEqual([]);
  onCommitDone(block);
  expect(writes).toEqual(["v"]);
});

test("结构块卸载时 cancelBlock 避免文本写入饿死", async () => {
  resetTxnForTest();
  const writes: string[] = [];
  const bumps: string[] = [];
  const text = makeText(() => "v", writes);
  const block = makeBlock(bumps);
  scheduleText(text);
  scheduleBlock(block);
  await tick();
  expect(writes).toEqual([]);
  cancelBlock(block);
  expect(writes).toEqual(["v"]);
});

test("coarse 模式把同组结构块合并为一次 bump（P-B）", async () => {
  resetTxnForTest();
  configureTxn({ granularity: "coarse" });
  expect(getGranularity()).toBe("coarse");
  const bumps: string[] = [];
  scheduleBlock(makeBlock(bumps, "group-1"));
  scheduleBlock(makeBlock(bumps, "group-1"));
  await tick();
  expect(bumps).toEqual(["bump"]);
});

test("fingerprint 未变化时跳过结构块 bump（P-B）", async () => {
  resetTxnForTest();
  const bumps: string[] = [];
  const block = makeBlock(bumps, undefined, () => 1);
  scheduleBlock(block);
  await tick();
  expect(bumps).toEqual(["bump"]);
  scheduleBlock(block);
  await tick();
  expect(bumps).toEqual(["bump"]);
});

test("scheduleRevision 把 deps 变化注入同一事务", async () => {
  resetTxnForTest();
  const writes: string[] = [];
  const bumps: string[] = [];
  const text = makeText(() => "v", writes);
  const block = makeBlock(bumps);
  scheduleRevision([text], [block]);
  await tick();
  expect(bumps).toEqual(["bump"]);
  expect(writes).toEqual([]);
  onCommitDone(block);
  expect(writes).toEqual(["v"]);
});

test("resetTxnForTest 恢复默认 granularity", () => {
  configureTxn({ granularity: "coarse" });
  resetTxnForTest();
  expect(getGranularity()).toBe("balanced");
});
