// JSX 渲染主干：递归合成节点文本，调度各指令实现，最后统一应用区间编辑。
use napi::bindgen_prelude::Result;
use tree_sitter::Node;

use crate::jsx_directive::ast::{
    attribute_expression, attribute_name, attributes, is_jsx_node,
};
use crate::jsx_directive::directives::v_bind;
use crate::jsx_directive::directives::v_for::{loop_binding, wrap_for};
use crate::jsx_directive::directives::v_html_text;
use crate::jsx_directive::directives::v_if::add_sequence_edits;
use crate::jsx_directive::directives::v_model::render_model;
use crate::jsx_directive::directives::v_show::render_show;
use crate::jsx_directive::types::{Config, Edit, Warning};
use crate::jsx_directive::utils::apply_edits;

pub(crate) fn render_node(
    node: Node<'_>,
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
    strip_own_condition: bool,
) -> Result<String> {
    let kind = node.kind();
    if kind == "jsx_opening_element" || kind == "jsx_self_closing_element" {
        let rendered = render_opening_element(node, source, config, warnings, strip_own_condition)?;
        return Ok(wrap_for(
            node,
            source,
            config,
            rendered,
            strip_own_condition,
        ));
    }

    let mut children = Vec::new();
    let mut cursor = node.walk();
    children.extend(node.named_children(&mut cursor));
    let mut edits = Vec::new();
    v_html_text::push_content_children_edits(node, &children, source, config, &mut edits);
    let covered = if children.iter().any(|child| is_jsx_node(child.kind())) {
        add_sequence_edits(node, &children, source, config, warnings, &mut edits)?
    } else {
        vec![false; children.len()]
    };

    for (index, child) in children.iter().enumerate() {
        if covered[index] {
            continue;
        }
        let strip_child_condition =
            is_jsx_node(kind) && child.kind() == "jsx_opening_element" && strip_own_condition;
        let text = render_node(*child, source, config, warnings, strip_child_condition)?;
        if text != source[child.start_byte()..child.end_byte()] {
            edits.push(Edit {
                start: child.start_byte(),
                end: child.end_byte(),
                replacement: text.clone(),
            });
        }
    }

    let rendered = apply_edits(source, node.start_byte(), node.end_byte(), edits);
    Ok(wrap_for(
        node,
        source,
        config,
        rendered,
        strip_own_condition,
    ))
}

pub(crate) fn render_opening_element(
    node: Node<'_>,
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
    strip_own_condition: bool,
) -> Result<String> {
    let attrs = attributes(node);
    let mut directives = Vec::new();
    let mut show_expression = None;
    let mut style_attribute = None;
    for attribute in &attrs {
        let Some(name) = attribute_name(*attribute, source) else {
            continue;
        };
        if name == "style" {
            style_attribute = Some(*attribute);
        }
        let Some(suffix) = name.strip_prefix(&config.prefix) else {
            continue;
        };
        if strip_own_condition && matches!(suffix, "if" | "else-if" | "else") {
            directives.push(*attribute);
        }
        if suffix == "for" {
            if loop_binding(*attribute, source).is_some() {
                directives.push(*attribute);
            } else {
                warnings.push(Warning {
                    message: format!(
                        "{name} must use JSX expression syntax, for example {name}={{item in items}}"
                    ),
                    start: attribute.start_byte() as u32,
                    end: attribute.end_byte() as u32,
                });
            }
        }
        if suffix == "show" {
            if let Some(expression) = attribute_expression(*attribute, source) {
                show_expression = Some(expression);
                directives.push(*attribute);
            } else {
                warnings.push(Warning {
                    message: format!(
                        "{name} must use expression syntax, for example {name}={{condition}}"
                    ),
                    start: attribute.start_byte() as u32,
                    end: attribute.end_byte() as u32,
                });
            }
        }
    }

    let mut edits = Vec::new();
    let (has_html, has_text) =
        v_html_text::check_conflict(node, &attrs, source, config, warnings);
    for attribute in &attrs {
        let Some(name) = attribute_name(*attribute, source) else {
            continue;
        };
        let suffix = name.strip_prefix(&config.prefix).unwrap_or_default();
        let replacement = if let Some(argument) = suffix
            .strip_prefix("bind:")
            .or_else(|| name.strip_prefix(':'))
        {
            v_bind::render_argument(argument, attribute, name, source, warnings)
        } else if suffix == "model" || suffix.starts_with("model:") {
            render_model(node, *attribute, &attrs, source, config, warnings)
        } else if suffix == "bind" {
            v_bind::render_object(attribute, name, source, warnings)
        } else if !has_html || !has_text {
            v_html_text::render_attribute(suffix, attribute, node, source)
        } else {
            None
        };
        if let Some(replacement) = replacement {
            edits.push(Edit {
                start: attribute.start_byte(),
                end: attribute.end_byte(),
                replacement,
            });
        }
    }
    for attribute in directives {
        let mut start = attribute.start_byte();
        while start > node.start_byte() && source.as_bytes()[start - 1].is_ascii_whitespace() {
            start -= 1;
        }
        edits.push(Edit {
            start,
            end: attribute.end_byte(),
            replacement: String::new(),
        });
    }

    if let Some(condition) = show_expression {
        render_show(
            node,
            &condition,
            style_attribute,
            source,
            config,
            warnings,
            &mut edits,
        )?;
    }

    Ok(apply_edits(
        source,
        node.start_byte(),
        node.end_byte(),
        edits,
    ))
}

