import type { Plugin } from "vite";
import { getSignalsFormats, transformSignals } from "../core";
import type { SignalsTransformConfig } from "../types";
import { reportWarnings } from "../shared/warnings";

export const SignalsTransformVite = (
  config: SignalsTransformConfig = {},
): Plugin => {
  return {
    name: "vite-plugin-signals-transform",
    enforce: "pre",
    transform(code, id) {
      const formats = getSignalsFormats(config);
      const testFormats = formats
        .map((format) => format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      if (!testFormats || !new RegExp(`\\.(${testFormats})$`, "i").test(id))
        return null;
      const result = transformSignals(code, id, config);
      reportWarnings(result.warnings, id, code, (warning) => {
        this.warn(
          `${warning.id}:${warning.loc.line}:${warning.loc.column + 1}: ${warning.message}`,
        );
      });
      return result.code === code ? null : { code: result.code, map: null };
    },
  };
};
