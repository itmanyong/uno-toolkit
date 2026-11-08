export type StyleRewritePattern = string | RegExp;

export type StyleRewriteType = "replace" | "append";

export interface StyleRewriteConfig {
  /** 需要处理的 css 匹配路径，规则与 style-layer 的 include 一致；省略时匹配所有 css 文件。 */
  matchPathReg?: StyleRewritePattern | StyleRewritePattern[];
  /** 需要命中的内容，支持文本与正则；数组内每一项都会执行一次匹配。 */
  rewriteMatchReg: string | string[];
  /** 命中的内容要替换为的目标内容。 */
  rewriteContent: string;
  /** replace 为替换覆写（默认），append 为追加。 */
  rewriteType?: StyleRewriteType;
}

/** transform 在源文件阶段改写；asset 在产物阶段改写最终 CSS 资源（仅构建生效）。 */
export type StyleRewriteMode = "transform" | "asset";

/** 产物阶段改写时机，默认 summarize：已压缩、尚未计算内容哈希。 */
export type StyleRewriteAssetStage =
  "additions" | "optimize-size" | "summarize" | "optimize-transfer";

export interface StyleRewriteOptions {
  /** 默认 transform；asset 用于处理 postcss 等后续阶段生成的最终 CSS。 */
  mode?: StyleRewriteMode;
  /** transform 模式的转换顺序，默认 pre。 */
  enforce?: "pre" | "post";
  /** asset 模式下读取产物的时机，默认 summarize。 */
  assetStage?: StyleRewriteAssetStage;
  /** 按数组顺序依次执行的配置；每一项独立设置匹配条件与改写内容。 */
  configs?: StyleRewriteConfig[];
}

export type StyleRewriteTransformConfig = StyleRewriteOptions;

export interface StyleRewriteRule {
  matchReg: string[];
  rewrite: string;
  rewriteType: StyleRewriteType;
}
