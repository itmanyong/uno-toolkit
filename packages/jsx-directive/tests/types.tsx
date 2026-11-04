import type { Attributes } from "react";
import type { JsxDirectiveAttributes } from "../src";

declare const condition: boolean;
declare const html: string;
declare const item: string;
declare const index: number;
declare const items: string[];
declare const name: string;
declare const setName: (value: string) => void;
declare const attrs: { title: string };
declare const ModelInput: (props: { modelValue?: string }) => React.ReactNode;

const valid = (
  <>
    <div v-if={condition} v-show={condition} v-html={html} />
    <p v-text={name} />
    <li v-for={item in items} />
    <img v-bind={attrs} v-bind:src={name} />
    <svg v-show={condition} v-bind:aria-label={name} />
    <input v-model={name} />
    <ModelInput v-model={name} v-model:first={[name, setName]} />
    <div v-else />
  </>
);
void valid;

const twoBindings = (
  // @ts-expect-error TypeScript 会对双变量写法中的逗号表达式报告 TS2695
  <li v-for={(item, index) in items} />
);
void twoBindings;

const exported: JsxDirectiveAttributes = {
  "v-html": html,
  "v-text": name,
  "v-for": item in items,
  "v-bind": attrs,
  "v-bind:title": name,
  "v-model": [name, setName],
  "v-model:first": name,
};
void exported;

const globalAttributes: Pick<Attributes, keyof JsxDirectiveAttributes> =
  exported;
const publicAttributes: JsxDirectiveAttributes = globalAttributes;
void publicAttributes;

// @ts-expect-error v-text 对应 React 子节点类型
const invalidText = <p v-text={{ message: name }} />;
// @ts-expect-error v-for 使用 item in items 的表达式结果
const invalidFor = <li v-for={items} />;
// @ts-expect-error v-bind 必须展开对象
const invalidBind = <div v-bind={name} />;
// @ts-expect-error v-else 不能带 false 值
const invalidElse = <div v-else={false} />;
// @ts-expect-error 导出类型与全局 JSX 类型保持相同约束
const invalidExported: JsxDirectiveAttributes = { "v-bind": name };
void [
  invalidText,
  invalidFor,
  invalidBind,
  invalidElse,
  invalidExported,
];
