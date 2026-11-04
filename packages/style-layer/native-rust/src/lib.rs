mod style_layer_transform;

use napi_derive::napi;

#[napi(object)]
pub struct StyleLayerImport {
    pub request: String,
    pub layer_name: String,
}

#[napi]
pub fn transform_style_layer(
    code: String,
    layer_name: String,
    skip_if_layer_exists: bool,
    import_layer: bool,
) -> String {
    style_layer_transform::transform_style_layer(
        code,
        layer_name,
        skip_if_layer_exists,
        import_layer,
    )
}

#[napi(js_name = "getStyleLayerImportTargets")]
pub fn get_style_layer_import_targets(code: String) -> Vec<String> {
    style_layer_transform::style_layer_import_targets(&code)
}

#[napi(js_name = "transformStyleLayerImports")]
pub fn transform_style_layer_imports(code: String, imports: Vec<StyleLayerImport>) -> String {
    style_layer_transform::transform_style_layer_imports(
        code,
        imports
            .into_iter()
            .map(|import| (import.request, import.layer_name))
            .collect(),
    )
}
