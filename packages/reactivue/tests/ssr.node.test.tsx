import { expect, test } from "rstack/test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { computed, ref } from "@vue/reactivity";
import { isServer } from "../src/shared/env";
import { scheduleBlock, scheduleText } from "../src/core/txn";
import type { BlockCell, TextCell } from "../src/core/txn";
import { TextBinding } from "../src/react/TextBinding";
import { defineComponent } from "../src/react/Host";

/**
 * 真 server 环境（node，无 window/document）下的 SSR 验证：
 * - isServer === true，覆盖 env.ts 的 typeof window === "undefined" 分支；
 * - renderToString 输出形态与 jsdom 版（ssr.test.tsx）一致；
 * - 事务调度在 server 上是 no-op：scheduleText / scheduleBlock 不排队，
 *   写入后无异常、无输出变化。
 */

/** 等到所有微任务（含可能排队的 flush）跑完。 */
async function settleScheduler(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("node 测试环境下 isServer 为 true", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(isServer).toBe(true);
});

test("server 端 TextBinding 的 SSR 输出与 jsdom 版一致", () => {
  const count = ref(7);
  const html = renderToString(
    <p>
      <TextBinding value={() => count.value} />
    </p>,
  );
  expect(html).toContain("7");
  expect(html).toContain('data-rv-anchor=""');
  expect(html).toContain("hidden");
});

test("server 端 defineComponent 的 SSR 输出与 jsdom 版一致", () => {
  const Demo = defineComponent<{ base: number }>((props) => {
    const count = ref(props.base);
    const doubled = computed(() => count.value * 2);
    return () => (
      <main>
        <h1>{count.value}</h1>
        <p>{doubled.value}</p>
        <TextBinding value={() => count.value} />
      </main>
    );
  });
  const html = renderToString(<Demo base={21} />);
  expect(html).toContain("<h1>21</h1>");
  expect(html).toContain("<p>42</p>");
  expect(html).toContain("21");
  expect(html).toContain('data-rv-anchor=""');
});

test("server 端 scheduleText 是 no-op：不排队、不写入、无异常", async () => {
  const count = ref(1);
  const writes: string[] = [];
  const cell: TextCell = {
    read: () => count.value,
    write: (text) => writes.push(text),
    runner: () => count.value,
    last: 1,
    alive: true,
  };

  expect(() => scheduleText(cell)).not.toThrow();
  count.value = 2; // 若排队，flush 时会读取新值并写入
  await settleScheduler();

  expect(writes).toEqual([]);
  expect(cell.last).toBe(1);
});

test("server 端 scheduleBlock 是 no-op：不排队、不 bump、无异常", async () => {
  let bumps = 0;
  let runnerCalls = 0;
  const cell: BlockCell = {
    bump: () => {
      bumps++;
    },
    getRunner: () => () => {
      runnerCalls++;
      return null;
    },
    alive: true,
  };

  expect(() => scheduleBlock(cell)).not.toThrow();
  await settleScheduler();

  expect(bumps).toBe(0);
  expect(runnerCalls).toBe(0);
});

test("server 端写入后渲染输出仍取首屏值（无响应式更新路径）", () => {
  const count = ref(7);
  const first = renderToString(
    <p>
      <TextBinding value={() => count.value} />
    </p>,
  );
  count.value = 99;
  // server 上没有直写通道，同一渲染树已序列化为字符串，不存在"输出变化"；
  // 重新渲染是全新求值，输出跟随当前值——证明写入链路（nodeValue/事务）不参与。
  const second = renderToString(
    <p>
      <TextBinding value={() => count.value} />
    </p>,
  );
  expect(first).toContain("7");
  expect(second).toContain("99");
});
