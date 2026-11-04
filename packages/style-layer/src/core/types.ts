export type StyleLayerPattern = string | RegExp;

export interface StyleLayerContext {
  filePath: string;
  fileName: string;
  ext: string;
  code: string;
}

export type StyleLayerName = string | ((context: StyleLayerContext) => string);

export interface StyleLayerRule {
  include?: StyleLayerPattern | StyleLayerPattern[];
  exclude?: StyleLayerPattern | StyleLayerPattern[];
  layerName?: StyleLayerName;
  skipIfLayerExists?: boolean;
  importLayer?: boolean;
}

export interface StyleLayerTransformOptions extends StyleLayerRule {
  enforce?: "pre" | "post";
  configs?: StyleLayerRule[];
}

export type StyleLayerTransformConfig = StyleLayerTransformOptions;
