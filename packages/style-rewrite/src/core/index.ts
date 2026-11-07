import { native } from "../shared/native";
import type {
  StyleRewriteConfig,
  StyleRewriteOptions,
  StyleRewritePattern,
  StyleRewriteRule,
} from "./types";

export {
  type StyleRewriteConfig,
  type StyleRewriteOptions,
  type StyleRewritePattern,
  type StyleRewriteRule,
  type StyleRewriteTransformConfig,
  type StyleRewriteType,
} from "./types";

const toPatterns = (
  pattern: StyleRewritePattern | StyleRewritePattern[] | undefined,
): StyleRewritePattern[] =>
  pattern === undefined ? [] : Array.isArray(pattern) ? pattern : [pattern];

const toStringList = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

/**
 * 与 style-layer 的 include 规则保持一致：支持正则、路径片段与 `*` / `**` 通配符。
 */
const matchesPattern = (
  pattern: StyleRewritePattern,
  filePath: string,
): boolean => {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    return pattern.test(filePath);
  }

  const normalizedPattern = pattern.replaceAll("\\", "/");
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (!/[*?]/.test(normalizedPattern)) {
    return normalizedPath.includes(normalizedPattern);
  }

  let expression = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*" && normalizedPattern[index + 1] === "*") {
      index += 1;
      if (normalizedPattern[index + 1] === "/") {
        expression += "(?:.*/)?";
        index += 1;
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(expression).test(normalizedPath);
};

const matchesPath = (
  patterns: StyleRewritePattern[],
  filePath: string,
): boolean =>
  patterns.length === 0 ||
  patterns.some((pattern) => matchesPattern(pattern, filePath));

const toRule = (config: StyleRewriteConfig): StyleRewriteRule => ({
  matchReg: toStringList(config.matchReg),
  rewrite: config.rewrite,
  rewriteType: config.rewriteType ?? "replace",
});

/**
 * 按 configs 数组顺序筛出作用于当前文件的配置，全部保留以便依次叠加执行。
 */
export const resolveStyleRewriteConfigs = (
  options: StyleRewriteOptions,
  filePath: string,
): StyleRewriteRule[] => {
  const rules: StyleRewriteRule[] = [];

  for (const config of options.configs ?? []) {
    if (!matchesPath(toPatterns(config.pathReg), filePath)) continue;
    rules.push(toRule(config));
  }

  return rules;
};

export const transformStyleRewrite = (
  options: StyleRewriteOptions,
  id: string,
  code: string,
): string | null => {
  const filePath = id.split("?")[0] ?? id;
  const rules = resolveStyleRewriteConfigs(options, filePath);
  if (rules.length === 0) return null;

  const transformed = native.rewriteCss(code, rules);
  return transformed === code ? null : transformed;
};

export const minifyCss = (code: string): string => native.minifyCss(code);

