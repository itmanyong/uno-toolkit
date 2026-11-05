import { expect, test } from "rstack/test";
import type { Plugin } from "vite";
import { JsxDirectiveRsbuild } from "../src/plugins/rsbuild";
import { JsxDirectiveVite } from "../src/plugins/vite";

const invokeTransform = (
  plugin: Plugin,
  code: string,
  id: string,
  warnings: string[] = [],
): unknown => {
  const hook = plugin.transform;
  if (!hook) throw new Error("Vite transform hook is missing");
  const handler = typeof hook === "function" ? hook : hook.handler;
  return Reflect.apply(
    handler,
    { warn: (message: string) => warnings.push(message) },
    [code, id],
  );
};

type RsbuildTransform = (input: {
  code: string;
  resourcePath: string;
}) => string | { code: string; map: null };

const setupRsbuild = (config?: Parameters<typeof JsxDirectiveRsbuild>[0]) => {
  let registration:
    { test: RegExp; order?: string; transform: RsbuildTransform } | undefined;
  const warnings: string[] = [];
  const plugin = JsxDirectiveRsbuild(config);
  const api = {
    transform: (
      options: { test: RegExp; order?: string },
      transform: RsbuildTransform,
    ) => {
      registration = { ...options, transform };
    },
    logger: { warn: (message: string) => warnings.push(message) },
  };

  if (!plugin.setup) throw new Error("Rsbuild setup hook is missing");
  Reflect.apply(plugin.setup, plugin, [api]);
  if (!registration) throw new Error("Rsbuild transform is not registered");
  return { registration, warnings };
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
    map: expect.any(String),
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
    map: expect.any(String),
  });
});

test("Vite 插件只处理配置的扩展名，未变化时返回 null", () => {
  const plugin = JsxDirectiveVite({ formats: [".JSX"] });
  const source = "<div v-show={visible} />";

  expect(invokeTransform(plugin, source, "component.tsx")).toBeNull();
  expect(invokeTransform(plugin, "<div />", "component.jsx")).toBeNull();
  expect(invokeTransform(plugin, source, "component.jsx")).toMatchObject({
    code: expect.stringContaining('["display"]'),
  });
  expect(
    invokeTransform(JsxDirectiveVite({ formats: [] }), source, "component.tsx"),
  ).toBeNull();
});

test("Vite 插件在没有代码改动时仍报告带行列的警告", () => {
  const warnings: string[] = [];
  const source = 'const label = "你好";\n<div v-else />';

  expect(
    invokeTransform(JsxDirectiveVite(), source, "component.tsx", warnings),
  ).toBeNull();
  expect(warnings).toEqual([
    expect.stringMatching(/^component\.tsx:2:6: Orphaned v-else directive:/),
  ]);
});

test("使用 Rsbuild 插件即注册 JSX 指令转换", () => {
  const { registration } = setupRsbuild();

  expect(
    registration.transform({
      code: "<div v-show={visible} />",
      resourcePath: "component.tsx",
    }),
  ).toEqual({
    code: "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
    map: expect.any(String),
  });
  // 不用 "pre"：Rsbuild 的多个 pre transform 按注册逆序执行，
  // default 档保证 reactivue（pre，消费 v-memo）恒先于本插件。
  expect(registration.order).toBeUndefined();
  expect(registration.test.test("component.tsx")).toBe(true);
  expect(registration.test.test("component.vue")).toBe(false);
});

test("Rsbuild 插件按配置筛选格式并传递前缀", () => {
  const { registration } = setupRsbuild({
    formats: [".JSX"],
    prefix: "x-",
  });

  expect(registration.test.test("component.jsx")).toBe(true);
  expect(registration.test.test("component.tsx")).toBe(false);
  expect(
    registration.transform({
      code: "<div x-show={visible} />",
      resourcePath: "component.jsx",
    }),
  ).toMatchObject({ code: expect.stringContaining('["display"]') });
  expect(
    setupRsbuild({ formats: [] }).registration.test.test("component.tsx"),
  ).toBe(false);
});

test("Vite 插件对残留 v-memo 抛出编译期错误", () => {
  const source = "const A = () => <p v-memo={[x]}>hi</p>;";
  expect(() =>
    invokeTransform(JsxDirectiveVite(), source, "component.tsx"),
  ).toThrow(/@uno-pc\/reactivue/);
  expect(() =>
    invokeTransform(JsxDirectiveVite(), source, "component.tsx"),
  ).toThrow(/component\.tsx:1:\d+:/);
});

test("memo: preserve 关闭残留报错", () => {
  const source = "const A = () => <p v-memo={[x]}>hi</p>;";
  expect(
    invokeTransform(
      JsxDirectiveVite({ memo: "preserve" }),
      source,
      "component.tsx",
    ),
  ).toBeNull();
});

test("Rsbuild 插件对残留 v-memo 同样抛错", () => {
  const { registration } = setupRsbuild();
  expect(() =>
    registration.transform({
      code: "const A = () => <p v-memo={[x]}>hi</p>;",
      resourcePath: "component.tsx",
    }),
  ).toThrow(/@uno-pc\/reactivue/);
  expect(() =>
    registration.transform({
      code: "const A = () => <p v-memo={[x]}>hi</p>;",
      resourcePath: "component.tsx",
    }),
  ).toThrow(/component\.tsx:1:\d+:/);
});

test("Rsbuild 插件对未变化代码返回原文并报告带行列的警告", () => {
  const { registration, warnings } = setupRsbuild();
  const source = 'const label = "你好";\n<div v-else />';

  expect(
    registration.transform({ code: source, resourcePath: "component.tsx" }),
  ).toBe(source);
  expect(warnings).toEqual([
    expect.stringMatching(/^component\.tsx:2:6: Orphaned v-else directive:/),
  ]);
});

test("有代码变化时输出 source map（UTF-16 偏移对齐）", () => {
  const source = 'const label = "你好";\nconst A = () => <div v-show={visible} />;';
  const hook = JsxDirectiveVite().transform;
  if (!hook) throw new Error("缺少 transform hook");
  const handler = typeof hook === "function" ? hook : hook.handler;
  const result = Reflect.apply(handler, {}, [source, "A.tsx"]) as {
    code: string;
    map: string | null;
  };
  expect(result.code).toContain("display");
  expect(result.map).toBeTruthy();
  const map = JSON.parse(result.map ?? "{}") as {
    version: number;
    sources: string[];
    sourcesContent: string[];
    mappings: string;
  };
  expect(map.version).toBe(3);
  expect(map.sources).toContain("A.tsx");
  // 含中文的源码：偏移按 UTF-16 对齐，sourcesContent 必须是完整原码
  expect(map.sourcesContent[0]).toBe(source);
  expect(map.mappings.length).toBeGreaterThan(0);
});
