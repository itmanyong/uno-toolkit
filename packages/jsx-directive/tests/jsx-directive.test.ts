import { expect, test } from "rstack/test";
import { getFormats, transformDirectives } from "../src/core";

test("扩展名使用规范化后的 JSX 默认格式", () => {
  expect(getFormats()).toEqual(["jsx", "tsx"]);
  expect(getFormats({ formats: [".TSX", "jsx"] })).toEqual(["tsx", "jsx"]);
});

test("按配置的 display 样式转换 v-show", () => {
  const result = transformDirectives(
    "<div v-show={visible} />",
    "component.tsx",
  );

  expect(result.code).toBe(
    "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
  );
  expect(result.warnings).toEqual([]);
});

test("不支持的文件格式保持源码不变", () => {
  const code = "<div v-show={visible} />";

  expect(transformDirectives(code, "component.vue")).toEqual({
    code,
    warnings: [],
  });
});

test("分支之间的空格与换行不中断条件链", () => {
  const result = transformDirectives(
    "<><A v-if={first} />\n  <B v-else-if={second} />\n  <C v-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("(second) ? (<B />)");
  expect(result.code).toContain("(<C />)");
  expect(result.code).not.toContain("v-else");
  expect(result.warnings).toEqual([]);
});

test("分支周围的空白与注释不中断条件链", () => {
  const result = transformDirectives(
    "<><A v-if={first} /> {/* keep */}<B v-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("/* keep */");
  expect(result.code).toContain("<B />");
  expect(result.code).not.toContain("v-else");
  expect(result.warnings).toEqual([]);
});
