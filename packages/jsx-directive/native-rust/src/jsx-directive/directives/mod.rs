// 指令目录：条件指令的解析分发，以及各指令实现模块。
pub(crate) mod v_bind;
pub(crate) mod v_for;
pub(crate) mod v_html_text;
pub(crate) mod v_if;
pub(crate) mod v_memo;
pub(crate) mod v_model;
pub(crate) mod v_show;

use napi::bindgen_prelude::Result;
use tree_sitter::Node;

use crate::jsx_directive::ast::{attribute_expression, attribute_name, attributes, opening_element};
use crate::jsx_directive::types::{Config, Warning};

pub(crate) enum Directive {
    If(String),
    ElseIf(String),
    Else,
}

pub(crate) fn directive_for(
    node: Node<'_>,
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> Result<Option<Directive>> {
    let Some(opening) = opening_element(node) else {
        return Ok(None);
    };
    for attribute in attributes(opening) {
        let Some(name) = attribute_name(attribute, source) else {
            continue;
        };
        let Some(suffix) = name.strip_prefix(&config.prefix) else {
            continue;
        };
        match suffix {
            "if" | "else-if" => {
                let Some(expression) = attribute_expression(attribute, source) else {
                    warnings.push(Warning {
                        message: format!(
                            "{name} must use expression syntax, for example {name}={{condition}}"
                        ),
                        start: attribute.start_byte() as u32,
                        end: attribute.end_byte() as u32,
                    });
                    return Ok(None);
                };
                return Ok(Some(if suffix == "if" {
                    Directive::If(expression)
                } else {
                    Directive::ElseIf(expression)
                }));
            }
            "else" => return Ok(Some(Directive::Else)),
            _ => {}
        }
    }
    Ok(None)
}

pub(crate) fn warn_orphan(
    node: Node<'_>,
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> Result<()> {
    let Some(opening) = opening_element(node) else {
        return Ok(());
    };
    for attribute in attributes(opening) {
        let Some(name) = attribute_name(attribute, source) else {
            continue;
        };
        if name == format!("{}else", config.prefix) || name == format!("{}else-if", config.prefix) {
            warnings.push(Warning {
                message: format!(
                    "Orphaned {name} directive: no adjacent preceding conditional branch"
                ),
                start: attribute.start_byte() as u32,
                end: attribute.end_byte() as u32,
            });
        }
    }
    Ok(())
}

