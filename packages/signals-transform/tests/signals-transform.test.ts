import { expect, test } from "rstack/test";
import { transformSignals } from "../src/core";
import type { Plugin } from "vite";
import { SignalsTransformPluginRsbuild } from "../src/plugins/rsbuild";
import { SignalsTransformPluginVite } from "../src/plugins/vite";

const invokeTransform = (plugin: Plugin, code: string, id: string): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(handler, { warn: () => {} }, [code, id]);
};

test("自动模式为读取信号值的组件注入订阅 Hook", () => {
  const result = transformSignals(
    "const count = signal(0); function Counter() { return <p>{count.value}</p>; }",
    "component.tsx",
  );

  expect(result.code).toContain("_useSignals(1)");
  expect(result.code).toContain("finally");
  expect(result.code).toContain("@preact/signals-react/runtime");
});

test("手动模式只转换带显式标记的组件", () => {
  const skipped = transformSignals(
    "function Counter() { return <p>{count.value}</p>; }",
    "component.tsx",
    { mode: "manual" },
  );
  const transformed = transformSignals(
    "/** @useSignals */ function Counter() { return <p />; }",
    "component.tsx",
    { mode: "manual", importSource: "custom-signals" },
  );

  expect(skipped.code).not.toContain("_useSignals");
  expect(transformed.code).toContain("_useSignals(1)");
  expect(transformed.code).toContain("custom-signals");
});

test("不支持的扩展名保持源码不变", () => {
  const source = "function Counter() { return <p>{count.value}</p>; }";

  expect(transformSignals(source, "component.vue").code).toBe(source);
});

test("使用 Vite 插件即启用 Signals 转换", () => {
  const source =
    "const count = signal(0); function Counter() { return <p>{count.value}</p>; }";

  expect(
    JSON.stringify(
      invokeTransform(SignalsTransformPluginVite(), source, "component.tsx"),
    ),
  ).toContain("_useSignals(1)");
});

test("Rsbuild 插件注册 Signals 转换", () => {
  const plugin = SignalsTransformPluginRsbuild();
  let handler:
    | ((input: {
        code: string;
        resourcePath: string;
      }) => string | { code: string; map: null })
    | undefined;
  const api = {
    transform: (
      options: { test: RegExp; order?: string },
      transform: (input: {
        code: string;
        resourcePath: string;
      }) => string | { code: string; map: null },
    ) => {
      if (options.test.test("component.tsx")) handler = transform;
    },
    logger: { warn: () => {} },
  };
  const source =
    "const count = signal(0); function Counter() { return <p>{count.value}</p>; }";

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);

  expect(
    JSON.stringify(handler?.({ code: source, resourcePath: "component.tsx" })),
  ).toContain("_useSignals(1)");
});
