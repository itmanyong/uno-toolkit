export interface TransformWarning {
  message: string;
  start: number;
  end: number;
}

export interface TransformResult {
  code: string;
  warnings: TransformWarning[];
  /** 编译期阻断错误，插件侧必须 throw。 */
  errors?: TransformWarning[];
  /** 顶层编辑区间（原码 UTF-16 偏移 → 替换文本），供 source map 生成；旧 native 缺省为 undefined。 */
  edits?: SourceEdit[];
}

export interface SourceEdit {
  start: number;
  end: number;
  replacement: string;
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
