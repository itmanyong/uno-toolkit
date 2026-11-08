import type { RsbuildPlugin } from "@rsbuild/core";
import { native } from "../shared/native";
import { resolveStyleRewriteConfigs } from "../core";
import type { StyleRewriteOptions } from "../core/types";

const cssFilePattern = /\.(?:css|pcss|postcss)(?:\?.*)?$/i;
const cssAssetPattern = /\.css$/i;

export const StyleRewritePluginRsbuild = (
  options: StyleRewriteOptions = {},
): RsbuildPlugin => ({
  name: "rsbuild-plugin-style-rewrite",
  setup(api) {
    // 产物阶段：此时 CSS 已由 postcss 等能力生成并压缩，可以改写最终资源。
    if (options.mode === "asset") {
      api.processAssets(
        {
          stage: options.assetStage ?? "summarize",
        },
        ({ assets, compilation, sources }) => {
          for (const [name, asset] of Object.entries(assets)) {
            if (!cssAssetPattern.test(name)) continue;

            const rules = resolveStyleRewriteConfigs(options, name);
            if (rules.length === 0) continue;

            const code = asset.source().toString();
            const transformed = native.rewriteCss(code, rules);
            if (transformed === code) continue;

            compilation.updateAsset(name, new sources.RawSource(transformed));
          }
        },
      );
      return;
    }

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
