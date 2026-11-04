import type { TransformWarning } from "./shared/types";
export type { TransformWarning } from "./shared/types";

export interface TransformResult {
  code: string;
  warnings: TransformWarning[];
}

export interface NativeSignalsTransformOptions {
  mode?: SignalsTransformMode;
  importSource?: string;
  detectTransformedJSX?: boolean;
  formats?: string[];
}

export interface NativeBindings {
  transform(
    code: string,
    filename: string,
    options?: NativeSignalsTransformOptions,
  ): TransformResult;
}

export type SignalsTransformMode = "auto" | "manual" | "all";

export interface SignalsTransformOptions {
  mode?: SignalsTransformMode;
  importSource?: string;
  detectTransformedJSX?: boolean;
  formats?: string[];
}

export type SignalsTransformConfig = SignalsTransformOptions;
