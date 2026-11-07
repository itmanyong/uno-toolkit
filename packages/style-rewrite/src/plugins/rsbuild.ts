import type { RsbuildPlugin } from "@rsbuild/core";
import { native } from "../shared/native";
import { resolveStyleRewriteConfigs } from "../core";
import type { StyleRewriteOptions } from "../core/types";

const cssFilePattern = /\.(?:css|pcss|postcss)(?:\?.*)?$/i;

export const StyleRewriteRsbuild = (
  options: StyleRewriteOptions = {},
): RsbuildPlugin => ({
  name: "rsbuild-plugin-style-rewrite",
  setup(api) {
    api.transform(
      {
        test: cssFilePattern,
        order: options.enforce ?? "pre",
      },
      ({ code, resourcePath }) => {
        const rules = resolveStyleRewriteConfigs(options, resourcePath);
        if (rules.length === 0) return code;

        const transformed = native.rewriteCss(code, rules);
        return transformed === code ? code : { code: transformed, map: null };
      },
    );
  },
});