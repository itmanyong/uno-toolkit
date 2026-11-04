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

export const transformDirectives = (
  code: string,
  filename: string,
  options: DirectiveTransformOptions = {},
): TransformResult => {
  const nativeOptions: NativeDirectiveTransformOptions = {
    prefix: options.prefix,
    formats: options.formats,
    ifFallback: options.ifFallback,
    showProperty: options.show?.property,
    showTrueValue: options.show?.whenTrue,
    showFalseValue: options.show?.whenFalse,
  };
  return native.transform(code, filename, nativeOptions);
};
