import { native } from "../shared/native";
import type {
  NativeSignalsTransformOptions,
  SignalsTransformOptions,
  TransformResult,
} from "../types";

export const getSignalsFormats = (
  options: SignalsTransformOptions = {},
): string[] =>
  (options.formats ?? ["js", "jsx", "ts", "tsx"]).map((format) =>
    format.replace(/^\./, "").toLowerCase(),
  );

export const transformSignals = (
  code: string,
  filename: string,
  options: SignalsTransformOptions = {},
): TransformResult => {
  const nativeOptions: NativeSignalsTransformOptions = {
    mode: options.mode,
    importSource: options.importSource,
    detectTransformedJSX: options.detectTransformedJSX,
    formats: options.formats,
  };
  return native.transform(code, filename, nativeOptions);
};
