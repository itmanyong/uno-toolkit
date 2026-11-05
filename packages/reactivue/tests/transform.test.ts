import { expect, test } from "rstack/test";
import { transformReactivue } from "../src/plugins/transform";

const transform = (code: string, options = {}) =>
  transformReactivue(code, "Counter.tsx", options);

test("defineComponent 的文本插值切为 TextBinding 并注入运行时 import", () => {
  const source =
    "const Counter = defineComponent((props) => { const count = ref(props.initial); return <h1>计数：{count.value}</h1>; });";
  const result = transform(source);
  expect(result.code).toContain(
    "import { TextBinding as _TextBinding",
  );
  expect(result.code).toContain("createCompiledHost as _createCompiledHost");
  expect(result.code).toContain("<_TextBinding value={() => (count.value)} />");
  expect(result.code).toContain("return { render: () =>");
  expect(result.code).toContain("_createCompiledHost((props)");
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test("复杂表达式与动态属性走结构通道", () => {
  const source =
    "const A = defineComponent(() => <div className={c.value ? 'a' : 'b'}>{items.map(i => <li>{i.n}</li>)}</div>);";
  const result = transform(source);
  expect(result.code).toContain("<_Block render={() => (items.map");
  expect(result.code).toContain("<_TextBinding value={() => (i.n)} />");
  expect(result.code).toContain("render={() => (<div className=");
});

test("v-memo 被消费为 MemoBlock，输入中不再残留该属性", () => {
  const source =
    "const A = defineComponent(() => <p v-memo={[props.label]}>{n.value}</p>);";
  const result = transform(source);
  expect(result.code).toContain("<_MemoBlock deps={() => ([props.label])}");
  expect(result.code).toContain("<_TextBinding value={() => (n.value)} />");
  expect(result.code).not.toContain("v-memo=");
});

test("defineComponent 之外的 v-memo 也被消费并告警", () => {
  const source = "export const A = () => <p v-memo={[x]}>hello</p>;";
  const result = transform(source);
  expect(result.code).not.toContain("v-memo=");
  expect(result.code).toContain("<_MemoBlock deps={() => ([x])}");
  expect(result.warnings).toHaveLength(1);
  expect(result.code).not.toContain("_createCompiledHost");
});

test("非数组 v-memo 降级并告警", () => {
  const result = transform(
    "const A = defineComponent(() => <p v-memo={x}>{n.value}</p>);",
  );
  expect(result.warnings[0].message).toContain("数组字面量");
  expect(result.code).not.toContain("v-memo=");
});

test("strict 模式把告警升级为阻断错误", () => {
  const result = transform(
    "const A = defineComponent(() => <p v-memo={x}>{n.value}</p>);",
    { strict: true },
  );
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.warnings).toEqual([]);
});

test("coarse 粒度生成 groupKey", () => {
  const result = transform(
    "const A = defineComponent(() => <div>{items.map(i => <li>{i.n}</li>)}</div>);",
    { granularity: "coarse" },
  );
  expect(result.code).toContain('groupKey="Counter.tsx#0"');
});

test("不支持的扩展名与静态文件原样返回", () => {
  const source = "const A = defineComponent(() => <p>{n.value}</p>);";
  const skipped = transformReactivue(source, "Counter.vue");
  expect(skipped.code).toBe(source);
  expect(skipped.errors).toEqual([]);
  const plain = transform("export const value = 1;");
  expect(plain.code).toBe("export const value = 1;");
});
