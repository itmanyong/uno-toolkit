import type { RsbuildPlugin } from "@rsbuild/core";
import { buildSourceMap } from "./sourcemap";
import { getFormats, toFilePattern, VUE_ALIAS } from "./shared";
import type { ReactivueTransformOptions } from "./shared";
import { transformReactivue } from "./transform";

export function ReactivueRsbuild(
  options: ReactivueTransformOptions = {},
): RsbuildPlugin {
  const pattern = toFilePattern(getFormats(options));
  return {
    name: "rsbuild-plugin-reactivue",
    setup(api) {
      if (options.alias !== false) {
        api.modifyRsbuildConfig((config) => {
          config.resolve ??= {};
          const existing = config.resolve.alias ?? {};
          config.resolve.alias = {
            ...(typeof existing === "object" && !Array.isArray(existing)
              ? existing
              : {}),
            ...VUE_ALIAS,
          };
        });
      }

      api.transform(
        { test: pattern, order: "pre" },
        ({ code, resourcePath }) => {
          const result = transformReactivue(code, resourcePath, options);
          if (result.errors.length > 0) {
            throw new Error(
              `${resourcePath}: ${result.errors
                .map((error) => `${error.start}: ${error.message}`)
                .join("\n")}`,
            );
          }
          for (const warning of result.warnings) {
            api.logger.warn(`${warning.start}: ${warning.message}`);
          }
          if (result.code === code) return code;
          if (result.edits && result.edits.length > 0) {
            return buildSourceMap(code, resourcePath, result.edits);
          }
          return { code: result.code, map: null };
        },
      );
    },
  };
}
