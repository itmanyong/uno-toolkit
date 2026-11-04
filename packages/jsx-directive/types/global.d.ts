import type { DOMAttributes, ReactNode } from "react";

interface JsxDirectiveAttributes {
  "v-if"?: unknown;
  "v-else-if"?: unknown;
  "v-else"?: true;
  "v-show"?: unknown;
  "v-html"?: NonNullable<
    DOMAttributes<HTMLElement>["dangerouslySetInnerHTML"]
  >["__html"];
  "v-text"?: ReactNode;
  "v-for"?: boolean;
  "v-bind"?: object;
  [attribute: `v-bind:${string}`]: unknown;
  "v-bind:name"?: unknown;
  [attribute: `v-model:${string}`]: unknown;
  "v-model"?: unknown;
  "v-model:name"?: unknown;
  [attribute: `:${string}`]: unknown;
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React 模块增强需要可合并的空接口。
  interface Attributes extends JsxDirectiveAttributes {}
}
