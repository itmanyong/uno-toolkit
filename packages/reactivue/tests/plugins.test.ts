import { expect, test } from "rstack/test";
import type { RsbuildPluginAPI } from "@rsbuild/core";
import { ReactivueVite } from "../src/plugins/vite";
import { ReactivueRsbuild } from "../src/plugins/rsbuild";
import {
  getFormats,
  toFilePattern,
  VUE_ALIAS,
} from "../src/plugins/shared";

test("formats 规范化与文件匹配", () => {
  expect(getFormats()).toEqual(["jsx", "tsx"]);
  expect(getFormats({ formats: [".TSX", "jsx"] })).toEqual(["tsx", "jsx"]);
  const pattern = toFilePattern(["tsx", "jsx"]);
  expect(pattern.test("App.tsx")).toBe(true);
  expect(pattern.test("App.ts")).toBe(false);
});

test("alias 表覆盖 vue 与 @vue/runtime-dom，不动 @vue/reactivity", () => {
  expect(VUE_ALIAS["vue"]).toBe("@uno-pc/reactivue/compat");
  expect(VUE_ALIAS["@vue/runtime-dom"]).toBe("@uno-pc/reactivue/compat");
  expect(VUE_ALIAS["@vue/reactivity"]).toBeUndefined();
});

test("Vite 插件跳过非 JSX 文件，不触发 native 加载", () => {
  const plugin = ReactivueVite();
  expect(plugin.name).toBe("vite-plugin-reactivue");
  const hook = plugin.transform;
  if (!hook) throw new Error("缺少 transform hook");
  const handler = typeof hook === "function" ? hook : hook.handler;
  const result = Reflect.apply(handler, { warn: () => undefined }, [
    "const a = 1",
    "file.ts",
  ]);
  expect(result).toBeNull();
});

test("Vite 插件透传告警，strict 错误直接抛出", () => {
  const source = "const A = defineComponent(() => <p v-memo={x}>{n.value}</p>);";
  const warnings: string[] = [];
  const hook = ReactivueVite().transform;
  if (!hook) throw new Error("缺少 transform hook");
  const handler = typeof hook === "function" ? hook : hook.handler;
  const context = { warn: (message: string) => warnings.push(message) };
  const result = Reflect.apply(handler, context, [source, "A.tsx"]);
  expect(result).toMatchObject({ map: null });
  expect(warnings).toHaveLength(1);

  const strictHook = ReactivueVite({ strict: true }).transform;
  if (!strictHook) throw new Error("缺少 strict transform hook");
  const strictHandler =
    typeof strictHook === "function" ? strictHook : strictHook.handler;
  expect(() =>
    Reflect.apply(strictHandler, context, [source, "A.tsx"]),
  ).toThrow(/数组字面量/);
});

test("Rsbuild 插件默认注入 alias，alias:false 时不注入", () => {
  let modifier: ((config: {
    resolve?: { alias?: Record<string, string> };
  }) => void) | undefined;
  const api = {
    modifyRsbuildConfig: (
      fn: (config: { resolve?: { alias?: Record<string, string> } }) => void,
    ) => {
      modifier = fn;
    },
    transform: () => undefined,
    logger: { warn: () => undefined },
  } as unknown as RsbuildPluginAPI;

  ReactivueRsbuild().setup?.(api);
  const config: { resolve?: { alias?: Record<string, string> } } = {};
  modifier?.(config);
  expect(config.resolve?.alias?.["vue"]).toBe(VUE_ALIAS["vue"]);

  modifier = undefined;
  ReactivueRsbuild({ alias: false }).setup?.(api);
  expect(modifier).toBeUndefined();
});
