// v-html / v-text：内容注入属性替换、子节点替换与互斥冲突校验。
use tree_sitter::Node;

use crate::jsx_directive::ast::{attribute_expression, attribute_name, attributes, opening_element};
use crate::jsx_directive::types::{Config, Edit, Warning};

/// 检测 v-html 与 v-text 同时使用，返回二者是否存在并告警。
pub(crate) fn check_conflict(
    node: Node<'_>,
    attrs: &[Node<'_>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> (bool, bool) {
    let has_html = attrs
        .iter()
        .any(|attr| attribute_name(*attr, source) == Some(&format!("{}html", config.prefix)));
    let has_text = attrs
        .iter()
        .any(|attr| attribute_name(*attr, source) == Some(&format!("{}text", config.prefix)));
    if has_html && has_text {
        warnings.push(Warning {
            message: "v-html and v-text cannot be used together".into(),
            start: node.start_byte() as u32,
            end: node.end_byte() as u32,
        });
    }
    (has_html, has_text)
}

/// 生成开标签上 v-html / v-text 对应属性的替换文本。
pub(crate) fn render_attribute(
    suffix: &str,
    attribute: &Node<'_>,
    node: Node<'_>,
    source: &str,
) -> Option<String> {
            if suffix == "html" {
                attribute_expression(*attribute, source).map(|expression| {
                    format!("dangerouslySetInnerHTML={{{{ __html: {expression} }}}}")
                })
            } else if suffix == "text" {
                attribute_expression(*attribute, source).map(|expression| {
                    if node.kind() == "jsx_self_closing_element" {
                        format!("children={{{expression}}}")
                    } else {
                        String::new()
                    }
                })
            } else {
                None
            }
}

/// v-html / v-text 会覆盖原有子节点，产出对应的区间编辑。
pub(crate) fn push_content_children_edits(
    node: Node<'_>,
    children: &[Node<'_>],
    source: &str,
    config: &Config,
    edits: &mut Vec<Edit>,
) {
    let kind = node.kind();
    if kind == "jsx_element" {
        if let Some(opening) = opening_element(node) {
            let attrs = attributes(opening);
            let html = attrs.iter().find(|attr| {
                attribute_name(**attr, source) == Some(&format!("{}html", config.prefix))
            });
            let text = attrs.iter().find(|attr| {
                attribute_name(**attr, source) == Some(&format!("{}text", config.prefix))
            });
            if html.is_some() != text.is_some() {
                let attribute = *html.or(text).expect("one content directive");
                if let Some(expression) = attribute_expression(attribute, source) {
                    if let Some(closing) = children
                        .iter()
                        .find(|child| child.kind() == "jsx_closing_element")
                    {
                        edits.push(Edit {
                            start: opening.end_byte(),
                            end: closing.start_byte(),
                            replacement: if text.is_some() {
                                format!("{{{expression}}}")
                            } else {
                                String::new()
                            },
                        });
                    }
                }
            }
        }
    }
}
