import type { RsbuildPlugin } from "@rsbuild/core";
import { getFormats, transformDirectives } from "../core";
import type { DirectiveTransformConfig } from "../core/types";
import { reportWarnings } from "../shared/warnings";

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
        order: "pre",
      },
      ({ code, resourcePath }) => {
        const result = transformDirectives(code, resourcePath, config);
        reportWarnings(result.warnings, resourcePath, code, (warning) => {
          api.logger.warn(
            `${warning.id}:${warning.loc.line}:${warning.loc.column + 1}: ${warning.message}`,
          );
        });
        return result.code === code ? code : { code: result.code, map: null };
      },
    );
  },
});
