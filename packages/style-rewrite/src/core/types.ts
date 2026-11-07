export type StyleRewritePattern = string | RegExp;

export type StyleRewriteType = "replace" | "append";

export interface StyleRewriteConfig {
  /** 需要处理的 css 匹配路径，规则与 style-layer 的 include 一致；省略时匹配所有 css 文件。 */
  pathReg?: StyleRewritePattern | StyleRewritePattern[];
  /** 需要命中的内容，支持文本与正则；数组内每一项都会执行一次匹配。 */
  matchReg: string | string[];
  /** 命中的内容要替换为的目标内容。 */
  rewrite: string;
  /** replace 为替换覆写（默认），append 为追加。 */
  rewriteType?: StyleRewriteType;
}

export interface StyleRewriteOptions {
  enforce?: "pre" | "post";
  /** 按数组顺序依次执行的配置；每一项独立设置匹配条件与改写内容。 */
  configs?: StyleRewriteConfig[];
}

export type StyleRewriteTransformConfig = StyleRewriteOptions;

export interface StyleRewriteRule {
  matchReg: string[];
  rewrite: string;
  rewriteType: StyleRewriteType;
}