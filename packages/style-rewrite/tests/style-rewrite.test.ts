import { expect, test } from "rstack/test";
import type { Plugin } from "vite";
import type { StyleRewriteOptions } from "../src/core";
import {
  minifyCss,
  resolveStyleRewriteConfigs,
  transformStyleRewrite,
} from "../src/core";
import { StyleRewritePluginRsbuild } from "../src/plugins/rsbuild";
import { StyleRewritePluginVite } from "../src/plugins/vite";

const invokeTransform = (plugin: Plugin, code: string, id: string): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(handler, {}, [code, id]);
};

test("省略 pathReg 时匹配所有 css 文件", () => {
  const options: StyleRewriteOptions = {
    configs: [
      { rewriteMatchReg: ".btn", rewriteContent: "color:blue" },
      { rewriteMatchReg: ".card", rewriteContent: "color:red" },
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
        matchPathReg: ["**/node_modules/**/*.css", /legacy\.css$/],
        rewriteMatchReg: ".btn",
        rewriteContent: "color:blue",
      },
      {
        matchPathReg: "**/src/**/*.css",
        rewriteMatchReg: ".card",
        rewriteContent: "color:red",
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
        { rewriteMatchReg: [".btn", ".card"], rewriteContent: "color:blue" },
      ],
    },
    "src/app.css",
  );

  expect(rules).toEqual([
    {
      matchReg: [".btn", ".card"],
      rewrite: "color:blue",
      rewriteType: "replace",
    },
  ]);
});

test("文本命中时替换与追加", () => {
  const replace = transformStyleRewrite(
    {
      configs: [{ rewriteMatchReg: "color:red", rewriteContent: "color:blue" }],
    },
    "src/app.css",
    ".a{color:red}",
  );
  expect(replace).toBe(".a{color:blue}");

  const append = transformStyleRewrite(
    {
      configs: [
        {
          rewriteMatchReg: "color:red",
          rewriteContent: ";padding:1px",
          rewriteType: "append",
        },
      ],
    },
    "src/app.css",
    ".a{color:red}",
  );
  expect(append).toBe(".a{color:red;padding:1px}");
});

test("选择器命中时改写声明块", () => {
  const replace = transformStyleRewrite(
    { configs: [{ rewriteMatchReg: ".btn", rewriteContent: "color:blue" }] },
    "src/app.css",
    ".btn{color:red;padding:1px}",
  );
  expect(replace).toBe(".btn{color:blue}");

  const append = transformStyleRewrite(
    {
      configs: [
        {
          rewriteMatchReg: ".btn",
          rewriteContent: "padding:0",
          rewriteType: "append",
        },
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
        {
          rewriteMatchReg: ".btn",
          rewriteContent: "color:blue",
          rewriteType: "append",
        },
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
          rewriteMatchReg: ".card",
          rewriteContent: "color:blue;margin:0",
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
        { rewriteMatchReg: ".btn", rewriteContent: "color:blue" },
        {
          rewriteMatchReg: "color:blue",
          rewriteContent: ";padding:0",
          rewriteType: "append",
        },
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
      {
        configs: [
          {
            matchPathReg: "**/vendor/**",
            rewriteMatchReg: ".btn",
            rewriteContent: "x",
          },
        ],
      },
      "src/app.css",
      ".btn{color:red}",
    ),
  ).toBeNull();
  expect(
    transformStyleRewrite(
      { configs: [{ rewriteMatchReg: ".missing", rewriteContent: "x" }] },
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
  const plugin = StyleRewritePluginVite({
    configs: [{ rewriteMatchReg: ".btn", rewriteContent: "color:blue" }],
  });

  expect(invokeTransform(plugin, ".btn{color:red}", "styles.css")).toEqual({
    code: ".btn{color:blue}",
    map: null,
  });
  expect(invokeTransform(plugin, ".btn{color:red}", "styles.ts")).toBeNull();
  expect(
    invokeTransform(
      StyleRewritePluginVite({}),
      ".btn{color:red}",
      "styles.css",
    ),
  ).toBeNull();
});

test("Rsbuild 插件注册 pre 顺序并改写 CSS", () => {
  const plugin = StyleRewritePluginRsbuild({
    configs: [{ rewriteMatchReg: ".btn", rewriteContent: "color:blue" }],
  });
  let registration: { order?: string } | undefined;
  let transform:
    | ((input: {
        code: string;
        resourcePath: string;
      }) => string | { code: string; map: null })
    | undefined;
  const api = {
    transform: (
      options: { test: RegExp; order?: string },
      handler: (input: {
        code: string;
        resourcePath: string;
      }) => string | { code: string; map: null },
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
    transform?.({
      code: ".btn{color:red}",
      resourcePath: "G:/project/src/styles.css",
    }),
  ).toEqual({ code: ".btn{color:blue}", map: null });
  expect(
    transform?.({
      code: ".card{color:red}",
      resourcePath: "G:/project/src/styles.css",
    }),
  ).toBe(".card{color:red}");
});

type AssetsHandler = (context: {
  assets: Record<string, { source: () => string }>;
  compilation: {
    updateAsset: (name: string, source: { source: () => string }) => void;
  };
  sources: { RawSource: new (value: string) => { source: () => string } };
}) => void;

test("Rsbuild 产物阶段改写最终 CSS", () => {
  let stage: string | undefined;
  let handler: AssetsHandler | undefined;

  const plugin = StyleRewritePluginRsbuild({
    mode: "asset",
    configs: [
      {
        matchPathReg: "**/*.css",
        rewriteMatchReg: ".light{",
        rewriteContent: ".light,.light .chakra-theme:not(.dark){",
      },
    ],
  });
  const api = {
    processAssets: (descriptor: { stage?: string }, next: AssetsHandler) => {
      stage = descriptor.stage;
      handler = next;
    },
  };

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);

  const updated: Array<[string, string]> = [];
  handler?.({
    assets: {
      "static/css/index.css": { source: () => ".light{color:red}" },
      "static/js/index.js": { source: () => "console.log(1)" },
    },
    compilation: {
      updateAsset: (name, source) => updated.push([name, source.source()]),
    },
    sources: {
      RawSource: class {
        constructor(private readonly value: string) {}

        source(): string {
          return this.value;
        }
      },
    },
  });

  expect(stage).toBe("summarize");
  expect(updated).toEqual([
    [
      "static/css/index.css",
      ".light,.light .chakra-theme:not(.dark){color:red}",
    ],
  ]);
});

test("Vite 产物阶段改写最终 CSS", () => {
  const plugin = StyleRewritePluginVite({
    mode: "asset",
    configs: [
      {
        rewriteMatchReg: ".light{",
        rewriteContent: ".light,.light .chakra-theme:not(.dark){",
      },
    ],
  });

  const bundle = {
    "assets/index.css": { type: "asset", source: ".light{color:red}" },
    "assets/index.js": { type: "chunk", code: "console.log(1)" },
  };

  const hook = plugin.generateBundle;
  if (!hook) throw new Error("Vite generateBundle hook is missing");
  const generate = typeof hook === "function" ? hook : hook.handler;
  Reflect.apply(generate as (...args: unknown[]) => unknown, {}, [{}, bundle]);

  expect(bundle["assets/index.css"].source).toBe(
    ".light,.light .chakra-theme:not(.dark){color:red}",
  );
});
