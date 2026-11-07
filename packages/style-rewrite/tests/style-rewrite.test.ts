import { expect, test } from "rstack/test";
import type { Plugin } from "vite";
import type { StyleRewriteOptions } from "../src/core";
import {
  minifyCss,
  resolveStyleRewriteConfigs,
  transformStyleRewrite,
} from "../src/core";
import { StyleRewriteRsbuild } from "../src/plugins/rsbuild";
import { StyleRewriteVite } from "../src/plugins/vite";

const invokeTransform = (plugin: Plugin, code: string, id: string): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(handler, {}, [code, id]);
};

test("省略 pathReg 时匹配所有 css 文件", () => {
  const options: StyleRewriteOptions = {
    configs: [
      { matchReg: ".btn", rewrite: "color:blue" },
      { matchReg: ".card", rewrite: "color:red" },
    ],
  };

  expect(resolveStyleRewriteConfigs(options, "src/app.css")).toHaveLength(2);
  expect(resolveStyleRewriteConfigs(options, "any/theme.css")).toHaveLength(2);
  expect(resolveStyleRewriteConfigs({}, "src/app.css")).toHaveLength(0);
});

test("pathReg 支持数组、路径片段、通配符与正则", () => {
  const options: StyleRewriteOptions = {
    configs: [
      {
        pathReg: ["**/node_modules/**/*.css", /legacy\.css$/],
        matchReg: ".btn",
        rewrite: "color:blue",
      },
      {
        pathReg: "**/src/**/*.css",
        matchReg: ".card",
        rewrite: "color:red",
        rewriteType: "append",
      },
    ],
  };

  expect(
    resolveStyleRewriteConfigs(options, "G:/project/node_modules/ui/theme.css"),
  ).toHaveLength(1);
  expect(
    resolveStyleRewriteConfigs(options, "G:/project/src/legacy.css"),
  ).toHaveLength(2);
  expect(
    resolveStyleRewriteConfigs(options, "G:/project/src/app.css")[0]
      ?.rewriteType,
  ).toBe("append");
});

test("matchReg 支持数组且默认按 replace 处理", () => {
  const rules = resolveStyleRewriteConfigs(
    {
      configs: [
        { matchReg: [".btn", ".card"], rewrite: "color:blue" },
      ],
    },
    "src/app.css",
  );

  expect(rules).toEqual([
    { matchReg: [".btn", ".card"], rewrite: "color:blue", rewriteType: "replace" },
  ]);
});

test("文本命中时替换与追加", () => {
  const replace = transformStyleRewrite(
    { configs: [{ matchReg: "color:red", rewrite: "color:blue" }] },
    "src/app.css",
    ".a{color:red}",
  );
  expect(replace).toBe(".a{color:blue}");

  const append = transformStyleRewrite(
    {
      configs: [
        { matchReg: "color:red", rewrite: ";padding:1px", rewriteType: "append" },
      ],
    },
    "src/app.css",
    ".a{color:red}",
  );
  expect(append).toBe(".a{color:red;padding:1px}");
});

test("选择器命中时改写声明块", () => {
  const replace = transformStyleRewrite(
    { configs: [{ matchReg: ".btn", rewrite: "color:blue" }] },
    "src/app.css",
    ".btn{color:red;padding:1px}",
  );
  expect(replace).toBe(".btn{color:blue}");

  const append = transformStyleRewrite(
    {
      configs: [
        { matchReg: ".btn", rewrite: "padding:0", rewriteType: "append" },
      ],
    },
    "src/app.css",
    ".btn{color:red}",
  );
  expect(append).toBe(".btn{color:red;padding:0}");
});

test("选择器追加时先移除同名样式再追加", () => {
  const single = transformStyleRewrite(
    {
      configs: [
        { matchReg: ".btn", rewrite: "color:blue", rewriteType: "append" },
      ],
    },
    "src/app.css",
    ".btn{color:red;padding:1px}",
  );
  expect(single).toBe(".btn{padding:1px;color:blue}");

  const multiple = transformStyleRewrite(
    {
      configs: [
        {
          matchReg: ".card",
          rewrite: "color:blue;margin:0",
          rewriteType: "append",
        },
      ],
    },
    "src/app.css",
    ".card{color:red;padding:1px;margin:2px}",
  );
  expect(multiple).toBe(".card{padding:1px;color:blue;margin:0}");
});

test("多条配置按数组顺序叠加执行", () => {
  const result = transformStyleRewrite(
    {
      configs: [
        { matchReg: ".btn", rewrite: "color:blue" },
        { matchReg: "color:blue", rewrite: ";padding:0", rewriteType: "append" },
      ],
    },
    "src/app.css",
    ".btn {\n  color: red;\n}\n",
  );

  expect(result).toBe(".btn{color:blue;padding:0}");
});

test("pathReg 不匹配或规则未命中时返回 null", () => {
  expect(
    transformStyleRewrite(
      { configs: [{ pathReg: "**/vendor/**", matchReg: ".btn", rewrite: "x" }] },
      "src/app.css",
      ".btn{color:red}",
    ),
  ).toBeNull();
  expect(
    transformStyleRewrite(
      { configs: [{ matchReg: ".missing", rewrite: "x" }] },
      "src/app.css",
      ".a{color:red}",
    ),
  ).toBeNull();
});

test("压缩结果保持单行并去掉注释", () => {
  expect(minifyCss("/* note */\n.a {\n  color: red;\n}\n")).toBe(
    ".a{color:red}",
  );
});

test("Vite 插件按配置改写 CSS", () => {
  const plugin = StyleRewriteVite({
    configs: [{ matchReg: ".btn", rewrite: "color:blue" }],
  });

  expect(invokeTransform(plugin, ".btn{color:red}", "styles.css")).toEqual({
    code: ".btn{color:blue}",
    map: null,
  });
  expect(invokeTransform(plugin, ".btn{color:red}", "styles.ts")).toBeNull();
  expect(invokeTransform(StyleRewriteVite({}), ".btn{color:red}", "styles.css")).toBeNull();
});

test("Rsbuild 插件注册 pre 顺序并改写 CSS", () => {
  const plugin = StyleRewriteRsbuild({
    configs: [{ matchReg: ".btn", rewrite: "color:blue" }],
  });
  let registration: { order?: string } | undefined;
  let transform:
    | ((input: { code: string; resourcePath: string }) =>
        | string
        | { code: string; map: null })
    | undefined;
  const api = {
    transform: (
      options: { test: RegExp; order?: string },
      handler: (input: { code: string; resourcePath: string }) =>
        | string
        | { code: string; map: null },
    ) => {
      if (options.test.test("src/styles.css")) {
        registration = options;
        transform = handler;
      }
    },
  };

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);

  expect(registration?.order).toBe("pre");
  expect(
    transform?.({ code: ".btn{color:red}", resourcePath: "G:/project/src/styles.css" }),
  ).toEqual({ code: ".btn{color:blue}", map: null });
  expect(
    transform?.({ code: ".card{color:red}", resourcePath: "G:/project/src/styles.css" }),
  ).toBe(".card{color:red}");
});