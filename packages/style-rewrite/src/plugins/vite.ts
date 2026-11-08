import type { Plugin } from "vite";
import { native } from "../shared/native";
import { resolveStyleRewriteConfigs } from "../core";
import type { StyleRewriteOptions } from "../core/types";

const cssFilePattern = /\.(?:css|pcss|postcss)(?:\?.*)?$/i;
const cssAssetPattern = /\.css$/i;

export const StyleRewritePluginVite = (
  options: StyleRewriteOptions = {},
): Plugin => {
  // 产物阶段：读取已生成的 CSS 资源再改写，可覆盖 postcss 等后续阶段产出的样式。
  if (options.mode === "asset") {
    return {
      name: "vite-plugin-style-rewrite",
      enforce: "post",
      generateBundle(_outputOptions, bundle) {
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type !== "asset" || !cssAssetPattern.test(fileName)) {
            continue;
          }

          const rules = resolveStyleRewriteConfigs(options, fileName);
          if (rules.length === 0) continue;

          const code =
            typeof output.source === "string"
              ? output.source
              : new TextDecoder().decode(output.source);
          const transformed = native.rewriteCss(code, rules);
          if (transformed === code) continue;

          output.source = transformed;
        }
      },
    };
  }

  return {
    name: "vite-plugin-style-rewrite",
    enforce: options.enforce ?? "pre",
    transform(code, id) {
      if (!cssFilePattern.test(id)) return null;

      const filePath = id.split("?")[0] ?? id;
      const rules = resolveStyleRewriteConfigs(options, filePath);
      if (rules.length === 0) return null;

      const transformed = native.rewriteCss(code, rules);
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
};
