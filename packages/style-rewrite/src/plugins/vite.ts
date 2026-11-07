import type { Plugin } from "vite";
import { native } from "../shared/native";
import { resolveStyleRewriteConfigs } from "../core";
import type { StyleRewriteOptions } from "../core/types";

const cssFilePattern = /\.(?:css|pcss|postcss)(?:\?.*)?$/i;

export const StyleRewriteVite = (options: StyleRewriteOptions = {}): Plugin => ({
  name: "vite-plugin-style-rewrite",
  enforce: options.enforce ?? "post",
  transform(code, id) {
    if (!cssFilePattern.test(id)) return null;

    const filePath = id.split("?")[0] ?? id;
    const rules = resolveStyleRewriteConfigs(options, filePath);
    if (rules.length === 0) return null;

    const transformed = native.rewriteCss(code, rules);
    return transformed === code ? null : { code: transformed, map: null };
  },
});