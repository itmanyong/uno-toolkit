/**
 * 浏览器判定口径 benchmark 场景定义（与 bench/run.mjs 的 jsdom 口径场景对齐）。
 *
 * 场景（经 URL hash 选择，如 #s1、#s3-block-32、#s12-coarse-128）：
 * - s1：单 TextBinding 高频写（文本通道直写 nodeValue）
 * - s2-block / s2-state：Block（结构通道） vs useState 基线（复杂表达式对照）
 * - s3-text-{m} / s3-block-{m}：m∈{8,32,128} 扇出（文本通道 / 结构通道）
 * - s5：同一写入命中 文本 + 属性块（帧内一致性）
 * - s12-{granularity}-{m}：granularity 三档 × m 扇出（groupKey 聚合观测）
 * - s11：startTransition 高频写入下结构块最终一致性（restart 观测）
 * - s6：SSR hydration 校验页（配合 scripts/ssr-generate.mjs 产出的 ssr.html）
 */
import * as React from "react";
import {
  ref,
  TextBinding,
  Block,
  configureTxn,
} from "@uno-pc/reactivue";

const h = React.createElement;

export const COMPLEX_ITEMS = 24;

export function complexExpr(n: number): string {
  let acc = "";
  for (let i = 1; i <= COMPLEX_ITEMS; i++) {
    acc += `${(n * i) % 97}|`;
  }
  return acc + `#${n}`;
}

export type Granularity = "fine" | "balanced" | "coarse";

export interface ScenarioApi {
  /** 单次写（触发当前场景的数据更新） */
  write(v: number): void;
  /** startTransition 包裹的单次写（仅 s11） */
  writeTransition?(v: number): void;
  /** 当前根节点文本 */
  getText(): string;
  /** 统计带 data-i 的块中，文本已包含 #v 的块数（s3-block/s11/s12 用） */
  getUpdatedCount(v: number): number;
  /** render 闭包计数（s2-block/s2-state 用） */
  getRenderCount?(): number;
}

export interface Scenario {
  element: React.ReactElement;
  api: ScenarioApi;
}

function updatedCount(v: number): number {
  return Array.from(document.querySelectorAll("[data-i]")).filter((n) =>
    (n.textContent ?? "").includes(`#${v}`),
  ).length;
}

function makeApi(
  write: (v: number) => void,
  extra: Partial<ScenarioApi> = {},
): ScenarioApi {
  return {
    write,
    getText: () => document.getElementById("root")?.textContent ?? "",
    getUpdatedCount: (v: number) => updatedCount(v),
    ...extra,
  };
}

export const SCENARIO_NAMES: string[] = [
  "s1",
  "s2-block",
  "s2-state",
  "s3-text-8",
  "s3-text-32",
  "s3-text-128",
  "s3-block-8",
  "s3-block-32",
  "s3-block-128",
  "s5",
  "s11",
  "s6",
  "s12-fine-8",
  "s12-fine-32",
  "s12-fine-128",
  "s12-balanced-8",
  "s12-balanced-32",
  "s12-balanced-128",
  "s12-coarse-8",
  "s12-coarse-32",
  "s12-coarse-128",
];

export function createScenario(name: string): Scenario {
  // ---- S1 单文本高频写 ----
  if (name === "s1") {
    const count = ref(0);
    const element = h("p", null, h(TextBinding, { value: () => count.value }));
    return { element, api: makeApi((v) => { count.value = v; }) };
  }

  // ---- S2a Block（结构通道，render 内含复杂表达式） ----
  if (name === "s2-block") {
    const count = ref(0);
    let renderCount = 0;
    const blockRender = () => {
      renderCount++;
      return h("div", null, complexExpr(count.value));
    };
    const element = h(Block, { render: blockRender });
    return {
      element,
      api: makeApi((v) => { count.value = v; }, {
        getRenderCount: () => renderCount,
      }),
    };
  }

  // ---- S2b 原生 useState 基线 ----
  if (name === "s2-state") {
    let renderCount = 0;
    let setN: ((v: number) => void) | null = null;
    function StateBaseline() {
      renderCount++;
      const [n, set] = React.useState(0);
      setN = set;
      return h("div", null, complexExpr(n));
    }
    return {
      element: h(StateBaseline),
      api: makeApi((v) => { setN?.(v); }, {
        getRenderCount: () => renderCount,
      }),
    };
  }

  // ---- S3 m 块扇出 ----
  {
    const m3 = /^s3-(text|block)-(\d+)$/.exec(name);
    if (m3) {
      const channel = m3[1] as "text" | "block";
      const m = Number(m3[2]);
      const count = ref(0);
      let renderCount = 0;
      const cells = Array.from({ length: m }, (_, i) =>
        channel === "text"
          ? h("span", { key: i }, h(TextBinding, { value: () => count.value }))
          : h(Block, {
              key: i,
              render: () => {
                renderCount++;
                return `b${i}#${complexExpr(count.value)}`;
              },
            }),
      );
      const element = h("div", null, cells);
      return {
        element,
        api: makeApi((v) => { count.value = v; }, {
          getRenderCount: () => renderCount,
        }),
      };
    }
  }

  // ---- S5 同一写入命中 文本 + 属性块 ----
  if (name === "s5") {
    const count = ref(0);
    const element = h(
      "div",
      null,
      h("p", null, h(TextBinding, { value: () => count.value })),
      h(Block, {
        render: () =>
          h("div", {
            className: `lv-${count.value}`,
            "data-v": String(count.value),
          }, "attr"),
      }),
    );
    return { element, api: makeApi((v) => { count.value = v; }) };
  }

  // ---- S11 startTransition 高频写入（restart 观测） ----
  if (name === "s11") {
    const M = 32;
    const count = ref(0);
    const cells = Array.from({ length: M }, (_, i) =>
      h(Block, {
        key: i,
        render: () => h("div", { "data-i": i }, `c${i}#${count.value}`),
      }),
    );
    return {
      element: h("div", null, cells),
      api: makeApi(
        (v) => { count.value = v; },
        {
          writeTransition: (v: number) => {
            React.startTransition(() => { count.value = v; });
          },
        },
      ),
    };
  }

  // ---- S6 SSR hydration 校验页 ----
  if (name === "s6") {
    const count = ref(21);
    const element = h(
      "div",
      null,
      h("p", null, h(TextBinding, { value: () => count.value })),
      h(Block, {
        render: () =>
          h("div", {
            className: `lv-${count.value}`,
            "data-v": String(count.value),
          }, "attr"),
      }),
    );
    return { element, api: makeApi((v) => { count.value = v; }) };
  }

  // ---- S12 granularity 三档 × m 扇出 ----
  {
    const m12 = /^s12-(fine|balanced|coarse)-(\d+)$/.exec(name);
    if (m12) {
      const granularity = m12[1] as Granularity;
      const m = Number(m12[2]);
      // 在挂载任何块之前设置全局事务档位
      configureTxn({ granularity });
      const count = ref(0);
      // coarse 判据依赖同 groupKey 合并；fine/balanced 下同 key 不聚合
      const groupKey = granularity === "coarse" ? "shared-group" : undefined;
      const cells = Array.from({ length: m }, (_, i) =>
        h(Block, {
          key: i,
          groupKey,
          render: () => h("div", { "data-i": i }, `c${i}#${count.value}`),
        }),
      );
      return {
        element: h("div", null, cells),
        api: makeApi((v) => { count.value = v; }),
      };
    }
  }

  throw new Error(`未知场景: ${name}`);
}
