// 入口：把样式包裹进命名 @layer，并按需为前置 @import 追加 layer()。

use super::imports::add_layer_to_import;
use super::rules::{extract_leading_rules, has_layer_rule};

pub fn transform_style_layer(
    code: String,
    layer_name: String,
    skip_if_layer_exists: bool,
    import_layer: bool,
) -> String {
    if code.trim().is_empty() {
        return code;
    }

    if skip_if_layer_exists && has_layer_rule(&code) {
        return code;
    }

    let (preamble, charset, imports, namespaces, body) = extract_leading_rules(&code);
    let imports = if import_layer {
        imports
            .into_iter()
            .map(|rule| add_layer_to_import(&rule, &layer_name))
            .collect::<Vec<_>>()
    } else {
        imports
    };

    let mut parts = Vec::new();
    if !preamble.trim().is_empty() {
        parts.push(preamble.trim().to_owned());
    }
    if let Some(charset) = charset {
        parts.push(charset);
    }
    if !imports.is_empty() {
        parts.push(imports.join("\n"));
    }
    if !namespaces.is_empty() {
        parts.push(namespaces.join("\n"));
    }
    if !body.trim().is_empty() {
        parts.push(format!("@layer {layer_name} {{\n{}\n}}", body.trim()));
    }

    parts.join("\n\n")
}
