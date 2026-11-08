import type { RsbuildPlugin } from "@rsbuild/core";
import { getSignalsFormats, transformSignals } from "../core";
import type { SignalsTransformConfig } from "../types";
import { reportWarnings } from "../shared/warnings";

export const SignalsTransformPluginRsbuild = (
  config: SignalsTransformConfig = {},
): RsbuildPlugin => ({
  name: "rsbuild-plugin-signals-transform",
  setup(api) {
    const options = config;
    const formats = getSignalsFormats(options)
      .map((format) => format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    api.transform(
      {
        test: formats ? new RegExp(`\\.(${formats})$`, "i") : /$a/,
        order: "pre",
      },
      ({ code, resourcePath }) => {
        const result = transformSignals(code, resourcePath, options);
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
