export interface TransformWarning {
  message: string;
  start: number;
  end: number;
}

export interface TransformResult {
  code: string;
  warnings: TransformWarning[];
  /** R-A：残留 v-memo 等编译期阻断错误，插件侧必须 throw。 */
  errors?: TransformWarning[];
}

export interface NativeDirectiveTransformOptions {
  prefix?: string;
  formats?: string[];
  ifFallback?: string;
  showProperty?: string;
  showTrueValue?: string;
  showFalseValue?: string;
  memo?: string;
}

export interface NativeBindings {
  transform(
    code: string,
    filename: string,
    options?: NativeDirectiveTransformOptions,
  ): TransformResult;
}
