export interface JsxDirectiveAttributes {
  "v-if"?: unknown;
  "v-else-if"?: unknown;
  "v-else"?: boolean;
  "v-show"?: unknown;
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
