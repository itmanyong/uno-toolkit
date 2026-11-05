import { getNative } from "../shared/native";
import {
  getNativeOptions,
  toFilePattern,
} from "./shared";
import type {
  ReactivueTransformOptions,
  TransformResult,
} from "./shared";

export function transformReactivue(
  code: string,
  filename: string,
  options: ReactivueTransformOptions = {},
): TransformResult {
  const formats = (options.formats ?? ["jsx", "tsx"]).map((format) =>
    format.replace(/^\./, "").toLowerCase(),
  );
  if (!toFilePattern(formats).test(filename)) {
    return { code, warnings: [], errors: [] };
  }
  return getNative().transform(code, filename, getNativeOptions(options));
}
