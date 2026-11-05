import type { Granularity } from "../core/txn";

export interface ReactivueTransformOptions {
  /** 参与转换的扩展名，默认 jsx / tsx。 */
  formats?: string[];
  /** 切块聚合粒度；P-B：首版即生效，coarse 会合并同组结构块。 */
  granularity?: Granularity;
  /** 是否自动注入 vue / @vue/runtime-dom alias，默认 true。 */
  alias?: boolean;
  /** setup 内检测到 React hooks 时是否报错，默认 false（仅告警）。 */
  strict?: boolean;
}

export interface TransformWarning {
  message: string;
  start: number;
  end: number;
}

export interface TransformResult {
  code: string;
  warnings: TransformWarning[];
  /** strict 模式下的阻断错误，插件侧必须 throw。 */
  errors: TransformWarning[];
  /** 顶层编辑区间（原码字节偏移 → 替换文本），供 source map 生成；旧 native 缺省为 undefined。 */
  edits?: SourceEdit[];
}

export interface SourceEdit {
  start: number;
  end: number;
  replacement: string;
}

export interface NativeTransformOptions {
  formats?: string[];
  granularity?: Granularity;
  strict?: boolean;
}

export const VUE_ALIAS: Record<string, string> = {
  vue: "@uno-pc/reactivue/compat",
  "@vue/runtime-dom": "@uno-pc/reactivue/compat",
};

export function getFormats(options: ReactivueTransformOptions = {}): string[] {
  return (options.formats ?? ["jsx", "tsx"]).map((format) =>
    format.replace(/^\./, "").toLowerCase(),
  );
}

export function getNativeOptions(
  options: ReactivueTransformOptions,
): NativeTransformOptions {
  return {
    formats: options.formats,
    granularity: options.granularity,
    strict: options.strict,
  };
}

export function toFilePattern(formats: string[]): RegExp {
  const escaped = formats
    .map((format) => format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return escaped ? new RegExp(`\\.(${escaped})$`, "i") : /$a/;
}
