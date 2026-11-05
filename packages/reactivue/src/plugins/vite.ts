import type { Plugin } from "vite";
import {
  getFormats,
  toFilePattern,
  VUE_ALIAS,
} from "./shared";
import type { ReactivueTransformOptions } from "./shared";
import { transformReactivue } from "./transform";

export function ReactivueVite(
  options: ReactivueTransformOptions = {},
): Plugin {
  const pattern = toFilePattern(getFormats(options));
  return {
    name: "vite-plugin-reactivue",
    // 必须先于 jsx-directive 运行：先消费 v-memo，再展开其余指令。
    enforce: "pre",
    config() {
      if (options.alias === false) return null;
      return { resolve: { alias: { ...VUE_ALIAS } } };
    },
    transform(code, id) {
      if (!pattern.test(id)) return null;
      const result = transformReactivue(code, id, options);
      if (result.errors.length > 0) {
        throw new Error(
          `${id}: ${result.errors.map((error) => `${error.start}: ${error.message}`).join("\n")}`,
        );
      }
      for (const warning of result.warnings) {
        this.warn(`${warning.start}: ${warning.message}`);
      }
      return result.code === code ? null : { code: result.code, map: null };
    },
  };
}
