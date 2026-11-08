import { expect, test } from "rstack/test";
import type { Plugin } from "vite";
import type { StyleLayerTransformOptions } from "../src/core";
import { resolveStyleLayer } from "../src/core";
import { StyleLayerPluginRsbuild } from "../src/plugins/rsbuild";
import { StyleLayerPluginVite } from "../src/plugins/vite";

const invokeTransform = (plugin: Plugin, code: string, id: string): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(handler, { warn: () => {}, resolve: async () => null }, [
    code,
    id,
  ]);
};

test("默认只匹配 CSS 文件并排除 node_modules", () => {
  expect(resolveStyleLayer({}, "src/app.css", "body {}")).toMatchObject({
    layerName: "default",
    skipIfLayerExists: true,
    importLayer: true,
  });
  expect(resolveStyleLayer({}, "src/app.scss", "body {}")).toBeUndefined();
  expect(
    resolveStyleLayer({}, "node_modules/vendor/theme.css", "body {}"),
  ).toBeUndefined();
});

test("多项规则按顺序匹配并覆盖公共配置", () => {
  const options: StyleLayerTransformOptions = {
    exclude: [],
    configs: [
      { include: "**/vendor/**/*.css", layerName: "vendor" },
      { include: /\.css$/, layerName: "application" },
    ],
  };

  expect(
    resolveStyleLayer(options, "node_modules/vendor/theme.css", "body {}")
      ?.layerName,
  ).toBe("vendor");
  expect(resolveStyleLayer(options, "src/app.css", "body {}")?.layerName).toBe(
    "application",
  );
});

test("图层名称回调可根据文件信息返回名称", () => {
  const options: StyleLayerTransformOptions = {
    layerName: ({ fileName, ext }) =>
      ext === ".css" ? fileName.split(".")[0] : "other",
  };

  expect(
    resolveStyleLayer(options, "src/theme.css", "body {}")?.layerName,
  ).toBe("theme");
});

test("使用 Vite 插件即启用样式层转换", () => {
  expect(
    invokeTransform(StyleLayerPluginVite(), ".button { color: red; }", "styles.css"),
  ).toEqual({
    code: "@layer default {\n.button { color: red; }\n}",
    map: null,
  });
});

test("Vite 插件可将匹配样式放入指定层", () => {
  const plugin = StyleLayerPluginVite({
    exclude: [],
    include: "**/node_modules/**/*.css",
    layerName: "vendor",
  });

  expect(
    invokeTransform(
      plugin,
      ".button { color: red; }",
      "node_modules/vendor/styles.css",
    ),
  ).toEqual({
    code: "@layer vendor {\n.button { color: red; }\n}",
    map: null,
  });
});

test("拒绝无效的 CSS layer 名称", () => {
  expect(() =>
    resolveStyleLayer({ layerName: "vendor;body" }, "src/theme.css", "body {}"),
  ).toThrow('Invalid CSS layer name "vendor;body" for "src/theme.css".');
});

test("Rsbuild 插件为匹配的 CSS 导入添加图层", async () => {
  const plugin = StyleLayerPluginRsbuild({
    exclude: [],
    configs: [
      {
        include: "**/node_modules/@radix-ui/**/*.css",
        layerName: "radix-ui",
      },
    ],
  });
  let registration: { order?: string } | undefined;
  let transform:
    | ((input: {
        code: string;
        resourcePath: string;
        resolve: (
          context: string,
          request: string,
          callback: (error: Error | null, result: string | false) => void,
        ) => void;
      }) => Promise<string | { code: string; map: null }>)
    | undefined;
  const api = {
    transform: (
      options: { test: RegExp; order?: string },
      handler: (input: {
        code: string;
        resourcePath: string;
        resolve: (
          context: string,
          request: string,
          callback: (error: Error | null, result: string | false) => void,
        ) => void;
      }) => Promise<string | { code: string; map: null }>,
    ) => {
      if (options.test.test("node_modules/vendor/theme.css")) {
        registration = options;
        transform = handler;
      }
    },
    logger: { warn: () => {} },
  };

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);

  expect(registration?.order).toBe("pre");
  const result = await transform?.({
    code: '@layer theme, base, radix-ui, utilities;\n@import "@radix-ui/themes/components.css";',
    resourcePath: "G:/project/src/styles.css",
    resolve: (_context, request, callback) =>
      callback(
        null,
        request === "@radix-ui/themes/components.css"
          ? "G:/project/node_modules/@radix-ui/themes/components.css"
          : false,
      ),
  });
  expect(result).toEqual({
    code: '@layer theme, base, radix-ui, utilities;\n@import "@radix-ui/themes/components.css" layer(radix-ui);',
    map: null,
  });
});
