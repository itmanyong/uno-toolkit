import { extname, basename } from "node:path";
import { native } from "../shared/native";
import type {
  StyleLayerContext,
  StyleLayerPattern,
  StyleLayerRule,
  StyleLayerTransformOptions,
} from "./types";

export {
  type StyleLayerContext,
  type StyleLayerName,
  type StyleLayerPattern,
  type StyleLayerRule,
  type StyleLayerTransformConfig,
  type StyleLayerTransformOptions,
} from "./types";

const defaultRule: Required<
  Pick<
    StyleLayerRule,
    "include" | "exclude" | "layerName" | "skipIfLayerExists" | "importLayer"
  >
> = {
  include: /\.css$/i,
  exclude: /(?:^|[\\/])node_modules(?:[\\/]|$)/i,
  layerName: "default",
  skipIfLayerExists: true,
  importLayer: true,
};

const toPatterns = (
  pattern: StyleLayerPattern | StyleLayerPattern[] | undefined,
): StyleLayerPattern[] =>
  pattern === undefined ? [] : Array.isArray(pattern) ? pattern : [pattern];

const matchesPattern = (
  pattern: StyleLayerPattern,
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

const matchesAny = (
  patterns: StyleLayerPattern | StyleLayerPattern[] | undefined,
  filePath: string,
): boolean =>
  toPatterns(patterns).some((pattern) => matchesPattern(pattern, filePath));

const mergeRule = (
  base: StyleLayerRule,
  override: StyleLayerRule,
): StyleLayerRule => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(override).filter(([, value]) => value !== undefined),
  ),
});

const resolveLayerName = (
  layerName: StyleLayerRule["layerName"],
  context: StyleLayerContext,
): string => {
  const resolved =
    typeof layerName === "function" ? layerName(context) : layerName;
  const name = resolved || "default";
  const identifier = String.raw`(?:--|-?[A-Za-z_])[A-Za-z0-9_-]*`;
  if (!new RegExp(`^${identifier}(?:\\.${identifier})*$`).test(name)) {
    throw new Error(
      `Invalid CSS layer name "${name}" for "${context.filePath}".`,
    );
  }
  return name;
};

export interface ResolvedStyleLayer {
  layerName: string;
  skipIfLayerExists: boolean;
  importLayer: boolean;
}

export const resolveStyleLayer = (
  options: StyleLayerTransformOptions,
  id: string,
  code: string,
): ResolvedStyleLayer | undefined => {
  const filePath = id.split("?")[0] ?? id;
  const rules = options.configs?.length
    ? options.configs.map((rule) =>
        mergeRule(defaultRule, mergeRule(options, rule)),
      )
    : [mergeRule(defaultRule, options)];

  for (const rule of rules) {
    if (!matchesAny(rule.include, filePath)) continue;
    if (matchesAny(rule.exclude, filePath)) continue;

    const context: StyleLayerContext = {
      filePath,
      fileName: basename(filePath),
      ext: extname(filePath),
      code,
    };

    return {
      layerName: resolveLayerName(rule.layerName, context),
      skipIfLayerExists: rule.skipIfLayerExists ?? true,
      importLayer: rule.importLayer ?? true,
    };
  }

  return undefined;
};

export const transformStyleLayerImports = async (
  options: StyleLayerTransformOptions,
  id: string,
  code: string,
  resolveImport: (
    request: string,
    importer: string,
  ) => Promise<string | undefined>,
): Promise<string> => {
  const targets = native.getStyleLayerImportTargets(code);
  if (targets.length === 0) return code;

  const imports: { request: string; layerName: string }[] = [];
  for (const request of targets) {
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(request)) continue;

    const resolvedId = await resolveImport(request, id);
    if (!resolvedId) continue;

    const layer = resolveStyleLayer(options, resolvedId, code);
    if (layer?.importLayer) {
      imports.push({ request, layerName: layer.layerName });
    }
  }

  return imports.length
    ? native.transformStyleLayerImports(code, imports)
    : code;
};
