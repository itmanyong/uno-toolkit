import { expect, test } from "rstack/test";
import type { Plugin } from "vite";
import { JsxDirectiveRsbuild } from "../src/plugins/rsbuild";
import { JsxDirectiveVite } from "../src/plugins/vite";

const invokeTransform = (plugin: Plugin, code: string, id: string): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(handler, { warn: () => {} }, [code, id]);
};

test("使用 Vite 插件即启用 JSX 指令转换", () => {
  expect(
    invokeTransform(
      JsxDirectiveVite(),
      "<div v-show={visible} />",
      "component.tsx",
    ),
  ).toEqual({
    code: "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
    map: null,
  });
});

test("Vite 插件接收转换配置", () => {
  expect(
    invokeTransform(
      JsxDirectiveVite({ prefix: "x-" }),
      "<div x-show={visible} />",
      "component.tsx",
    ),
  ).toEqual({
    code: "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
    map: null,
  });
});

test("使用 Rsbuild 插件即注册 JSX 指令转换", () => {
  const plugin = JsxDirectiveRsbuild();
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

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);

  expect(
    handler?.({
      code: "<div v-show={visible} />",
      resourcePath: "component.tsx",
    }),
  ).toEqual({
    code: "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
    map: null,
  });
});
