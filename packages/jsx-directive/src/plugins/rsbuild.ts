import type { RsbuildPlugin } from "@rsbuild/core";
import { getFormats, transformDirectives } from "../core";
import { buildSourceMap } from "./sourcemap";
import type { DirectiveTransformConfig } from "../core/types";
import { reportWarnings, throwOnErrors } from "../shared/warnings";

export const JsxDirectiveRsbuild = (
  config: DirectiveTransformConfig = {},
): RsbuildPlugin => ({
  name: "rsbuild-plugin-jsx-directive",
  setup(api) {
    const formats = getFormats(config)
      .map((format) => format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    api.transform(
      {
        test: formats ? new RegExp(`\\.(${formats})$`, "i") : /$a/,
        // 不用 "pre"：Rsbuild 的多个 pre transform 按注册逆序执行，
        // 而 reactivue 是 pre —— default 保证 reactivue（消费 v-memo）永远先跑。
      },
      ({ code, resourcePath }) => {
        const result = transformDirectives(code, resourcePath, config);
        throwOnErrors(result.errors, resourcePath, code);
        reportWarnings(result.warnings, resourcePath, code, (warning) => {
          api.logger.warn(
            `${warning.id}:${warning.loc.line}:${warning.loc.column + 1}: ${warning.message}`,
          );
        });
        if (result.code === code) return code;
        if (result.edits && result.edits.length > 0) {
          return buildSourceMap(code, resourcePath, result.edits);
        }
        return { code: result.code, map: null };
      },
    );
  },
});
