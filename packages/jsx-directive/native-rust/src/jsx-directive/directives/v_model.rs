// v-model：原生控件与自定义组件的双向绑定降级，含冲突校验与告警。
use tree_sitter::Node;

use crate::jsx_directive::ast::{attribute_name, attribute_value, directive_expression};
use crate::jsx_directive::types::{Config, Warning};
use crate::jsx_directive::utils::{fresh_parameter, is_identifier};

pub(crate) fn model_binding(attribute: Node<'_>, source: &str) -> Option<(String, String)> {
    let expression = attribute.named_child(1)?;
    if expression.kind() != "jsx_expression" {
        return None;
    }
    let mut cursor = expression.walk();
    let value = expression
        .named_children(&mut cursor)
        .find(|child| child.kind() != "comment")?;
    model_expression(value, source)
}

pub(crate) fn model_expression(value: Node<'_>, source: &str) -> Option<(String, String)> {
    if value.kind() == "identifier" {
        let value = source[value.start_byte()..value.end_byte()].to_string();
        let mut uppercase = true;
        let mut setter = String::from("set");
        for ch in value.chars() {
            if ch == '_' {
                uppercase = true;
            } else if uppercase {
                setter.extend(ch.to_uppercase());
                uppercase = false;
            } else {
                setter.push(ch);
            }
        }
        return Some((value, setter));
    }
    if value.kind() == "array" {
        let mut cursor = value.walk();
        let entries: Vec<_> = value
            .named_children(&mut cursor)
            .filter(|child| child.kind() != "comment")
            .collect();
        if entries.len() == 2 && entries.iter().all(|entry| entry.kind() != "spread_element") {
            let mut cursor = value.walk();
            let commas: Vec<_> = value
                .children(&mut cursor)
                .filter(|child| child.kind() == ",")
                .collect();
            if !(1..=2).contains(&commas.len())
                || commas[0].start_byte() < entries[0].end_byte()
                || commas[0].end_byte() > entries[1].start_byte()
                || commas
                    .get(1)
                    .is_some_and(|comma| comma.start_byte() < entries[1].end_byte())
            {
                return None;
            }
            return Some((
                source[entries[0].start_byte()..entries[0].end_byte()].to_string(),
                source[entries[1].start_byte()..entries[1].end_byte()].to_string(),
            ));
        }
    }
    None
}

pub(crate) fn render_model(
    node: Node<'_>,
    attribute: Node<'_>,
    attrs: &[Node<'_>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> Option<String> {
    let invalid = |warnings: &mut Vec<Warning>, message: &str| {
        warnings.push(Warning {
            message: message.into(),
            start: attribute.start_byte() as u32,
            end: attribute.end_byte() as u32,
        });
        None
    };
    let Some((value, setter)) = model_binding(attribute, source) else {
        return invalid(
            warnings,
            "x-model requires an identifier or [value, setter] expression",
        );
    };
    let tag = node.child_by_field_name("name")?;
    let tag = &source[tag.start_byte()..tag.end_byte()];
    let custom = tag.chars().next().is_some_and(char::is_uppercase) || tag.contains('.');
    let find = |name: &str| {
        attrs
            .iter()
            .find(|attr| {
                let attr_name = attribute_name(**attr, source);
                attr_name == Some(name)
                    || config.prefixes.iter().any(|prefix| {
                        attr_name == Some(&format!("{}bind:{name}", prefix))
                    })
            })
            .copied()
    };
    let read_value = |attr| {
        if attribute_name(attr, source).is_some_and(|name| {
            config
                .prefixes
                .iter()
                .any(|prefix| name.starts_with(&format!("{}bind:", prefix)))
        }) {
            directive_expression(attr, source)
        } else {
            attribute_value(attr, source)
        }
    };
    let argument = attribute_name(attribute, source)
        .and_then(|name| name.split_once(':').map(|(_, argument)| argument));
    if custom {
        let property = argument.unwrap_or("modelValue");
        if !is_identifier(property) {
            return invalid(warnings, "x-model requires a valid property name");
        }
        let mut chars = property.chars();
        let event = format!("onUpdate{}{}", chars.next()?.to_uppercase(), chars.as_str());
        if find(property).is_some() || find(&event).is_some() {
            return invalid(
                warnings,
                "x-model conflicts with an existing model property or update handler",
            );
        }
        let callback_value = fresh_parameter(source, "value");
        return Some(format!(
            "{property}={{{value}}} {event}={{{callback_value} => ({setter})({callback_value})}}"
        ));
    }
    if argument.is_some() {
        return invalid(
            warnings,
            "Named v-model is only supported on custom components",
        );
    }
    let input_type = find("type").and_then(read_value);
    if tag == "input"
        && input_type
            .as_ref()
            .is_some_and(|value| !value.starts_with(['\'', '"']))
    {
        return invalid(warnings, "x-model requires a static input type");
    }
    let input_type = input_type
        .as_deref()
        .unwrap_or("\"text\"")
        .trim_matches(['\'', '"']);
    let (property, binding, update) = match tag {
        "input" if input_type == "checkbox" => {
            if let Some(option) = find("value").and_then(read_value) {
                let binding = format!("({value}).includes({option})");
                let update = format!(
                    "__MODEL_EVENT__.currentTarget.checked ? [...({value}), ({option})] : ({value}).filter(__item => __item !== ({option}))"
                );
                ("checked", binding, Some(update))
            } else {
                (
                    "checked",
                    value.clone(),
                    Some("__MODEL_EVENT__.currentTarget.checked".to_string()),
                )
            }
        }
        "input" if input_type == "radio" => {
            let Some(option) = find("value").and_then(read_value) else {
                return invalid(
                    warnings,
                    "x-model on radio inputs requires a value attribute",
                );
            };
            ("checked", format!("({value}) === ({option})"), Some(option))
        }
        "input" | "textarea" => (
            "value",
            value.clone(),
            Some("__MODEL_EVENT__.currentTarget.value".to_string()),
        ),
        "select" => {
            let multiple = find("multiple");
            let mode = multiple.and_then(read_value);
            let update = match (multiple.is_some(), mode.as_deref()) {
                (false, _) | (_, Some("false")) => "__MODEL_EVENT__.currentTarget.value",
                (true, None | Some("true")) => {
                    "Array.from(__MODEL_EVENT__.currentTarget.selectedOptions, option => option.value)"
                }
                _ => {
                    "__MODEL_EVENT__.currentTarget.multiple ? Array.from(__MODEL_EVENT__.currentTarget.selectedOptions, option => option.value) : __MODEL_EVENT__.currentTarget.value"
                }
            };
            ("value", value.clone(), Some(update.to_string()))
        }
        _ => {
            return invalid(
                warnings,
                "x-model supports input, textarea, select and custom components",
            );
        }
    };
    if find(property).is_some() || find("onChange").is_some() {
        return invalid(
            warnings,
            "x-model conflicts with an existing value, checked or onChange attribute",
        );
    }
    let event_parameter = fresh_parameter(source, "event");
    let update = update?.replace("__MODEL_EVENT__", &event_parameter);
    let handler = format!("{event_parameter} => ({setter})({update})");
    Some(format!("{property}={{{binding}}} onChange={{{handler}}}"))
}