export interface NativeRewriteRule {
  matchReg: string[];
  rewrite: string;
  rewriteType: string;
}

export interface NativeBindings {
  rewriteCss(code: string, rules: NativeRewriteRule[]): string;
  minifyCss(code: string): string;
}