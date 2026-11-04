interface JsxDirectiveAttributes {
  "v-if"?: unknown;
  "v-else-if"?: unknown;
  "v-else"?: boolean;
  "v-show"?: unknown;
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React 模块增强需要可合并的空接口。
  interface Attributes extends JsxDirectiveAttributes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React 模块增强需要可合并的空接口。
  interface HTMLAttributes<T> extends JsxDirectiveAttributes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React 模块增强需要可合并的空接口。
  interface SVGAttributes<T> extends JsxDirectiveAttributes {}
}
