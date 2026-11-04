export interface TransformWarning {
  message: string;
  start: number;
  end: number;
}

export interface NativeBindings {
  transformStyleLayer(
    code: string,
    layerName: string,
    skipIfLayerExists: boolean,
    importLayer: boolean,
  ): string;
  getStyleLayerImportTargets(code: string): string[];
  transformStyleLayerImports(
    code: string,
    imports: { request: string; layerName: string }[],
  ): string;
}
