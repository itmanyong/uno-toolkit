import { native } from "../shared/native";
import type { TransformResult } from "../types";
import type {
  DirectiveTransformOptions,
  NativeDirectiveTransformOptions,
} from "./types";

export const getFormats = (options: DirectiveTransformOptions = {}): string[] =>
  (options.formats ?? ["jsx", "tsx"]).map((format) =>
    format.replace(/^\./, "").toLowerCase(),
  );

const normalizePrefix = (
  prefix: DirectiveTransformOptions["prefix"],
): string[] | undefined => {
  if (prefix === undefined) return undefined;
  return Array.isArray(prefix) ? prefix : [prefix];
};

export const transformDirectives = (
  code: string,
  filename: string,
  options: DirectiveTransformOptions = {},
): TransformResult => {
  const nativeOptions: NativeDirectiveTransformOptions = {
    prefix: normalizePrefix(options.prefix),
    formats: options.formats,
    ifFallback: options.vIf?.notFallback,
    showProperty: options.vShow?.property,
    showTrueValue: options.vShow?.whenTrueValue,
    showFalseValue: options.vShow?.whenFalseValue,
  };
  const result = native.transform(code, filename, nativeOptions);
  // 无阻断错误时不暴露 errors 字段，保持既有返回结构稳定（errors 为可选）。
  return result.errors?.length
    ? result
    : {
        code: result.code,
        warnings: result.warnings,
        edits: result.edits,
      };
};
