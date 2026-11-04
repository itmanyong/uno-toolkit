export interface TransformWarning {
  message: string;
  start: number;
  end: number;
}

export interface TransformResult {
  code: string;
  warnings: TransformWarning[];
}

export interface NativeDirectiveTransformOptions {
  prefix?: string;
  formats?: string[];
  ifFallback?: string;
  showProperty?: string;
  showTrueValue?: string;
  showFalseValue?: string;
}

export interface NativeBindings {
  transform(
    code: string,
    filename: string,
    options?: NativeDirectiveTransformOptions,
  ): TransformResult;
}
