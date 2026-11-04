import type { DOMAttributes, ReactNode } from "react";

export interface JsxDirectiveAttributes {
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
  "v-model"?: unknown;
  [attribute: `v-model:${string}`]: unknown;
  "v-model:name"?: unknown;
  [attribute: `:${string}`]: unknown;
}

export interface DirectiveTransformOptions {
  prefix?: string;
  formats?: string[];
  ifFallback?: string;
  show?: {
    property?: string;
    whenTrue?: string;
    whenFalse?: string;
  };
}

export type DirectiveTransformConfig = DirectiveTransformOptions;

export interface NativeDirectiveTransformOptions {
  prefix?: string;
  formats?: string[];
  ifFallback?: string;
  showProperty?: string;
  showTrueValue?: string;
  showFalseValue?: string;
}
