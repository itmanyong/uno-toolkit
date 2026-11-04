import type { Plugin } from "vite";
import { getFormats, transformDirectives } from "../core";
import type { DirectiveTransformConfig } from "../core/types";
import { reportWarnings } from "../shared/warnings";

export const JsxDirectiveVite = (
  config: DirectiveTransformConfig = {},
): Plugin => {
  return {
    name: "vite-plugin-jsx-directive",
    enforce: "pre",
    transform(code, id) {
      const formats = getFormats(config);
      const testFormats = formats
        .map((format) => format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      if (!testFormats || !new RegExp(`\\.(${testFormats})$`, "i").test(id))
        return null;
      const result = transformDirectives(code, id, config);
      reportWarnings(result.warnings, id, code, (warning) => {
        this.warn(
          `${warning.id}:${warning.loc.line}:${warning.loc.column + 1}: ${warning.message}`,
        );
      });
      return result.code === code ? null : { code: result.code, map: null };
    },
  };
};
