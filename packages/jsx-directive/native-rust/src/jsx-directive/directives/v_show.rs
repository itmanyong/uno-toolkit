// v-show：把显隐条件并入 style 表达式，兼容既有 style 属性。
use napi::bindgen_prelude::{Error, Result};
use tree_sitter::Node;

use crate::jsx_directive::types::{Config, Edit, Warning};

/// 依据 show 条件生成 style 替换/插入编辑；已有非表达式 style 时只告警不改写。
#[allow(clippy::too_many_arguments)]
pub(crate) fn render_show(
    node: Node<'_>,
    condition: &str,
    style_attribute: Option<Node<'_>>,
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
    edits: &mut Vec<Edit>,
) -> Result<()> {
        let style_text = if let Some(style) = style_attribute {
            let mut cursor = style.walk();
            let value = style.named_children(&mut cursor).nth(1);
            match value {
                Some(value) if value.kind() == "jsx_expression" => {
                    let raw = &source[value.start_byte()..value.end_byte()];
                    raw.strip_prefix('{')
                        .and_then(|inner| inner.strip_suffix('}'))
                        .map(str::trim)
                        .map(ToString::to_string)
                }
                _ => None,
            }
        } else {
            None
        };
        if let (Some(style), None) = (style_attribute, style_text.as_ref()) {
            warnings.push(Warning {
                message: "v-show requires style to be an expression, for example style={{ color: 'red' }}".into(),
                start: style.start_byte() as u32,
                end: style.end_byte() as u32,
            });
        } else {
            let property = serde_json::to_string(&config.show_property)
                .map_err(|error| Error::from_reason(error.to_string()))?;
            let spread = style_text
                .as_ref()
                .map(|style| format!("...({style}), "))
                .unwrap_or_default();
            let value = format!(
                "{{{spread}[{property}]: ({condition}) ? ({}) : ({})}}",
                config.show_true_value, config.show_false_value
            );
            let replacement = format!("style={{{value}}}");
            if let Some(style) = style_attribute {
                edits.push(Edit {
                    start: style.start_byte(),
                    end: style.end_byte(),
                    replacement,
                });
            } else {
                let mut cursor = node.walk();
                let name = node
                    .named_children(&mut cursor)
                    .next()
                    .ok_or_else(|| Error::from_reason("JSX element has no tag name"))?;
                let insert = name.end_byte();
                edits.push(Edit {
                    start: insert,
                    end: insert,
                    replacement: format!(" {replacement}"),
                });
            }
        }
    Ok(())
}
