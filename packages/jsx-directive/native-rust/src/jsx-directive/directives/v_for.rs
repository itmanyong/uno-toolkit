// v-for：解析 `item in items` 绑定，把已渲染节点包装为 .map()。
use tree_sitter::{Node, Parser};

use crate::jsx_directive::ast::{attribute_name, attributes, is_jsx_container, is_jsx_node, opening_element};
use crate::jsx_directive::types::Config;
use crate::jsx_directive::utils::is_identifier;

pub(crate) fn loop_binding(attribute: Node<'_>, source: &str) -> Option<(String, String)> {
    let value = attribute.named_child(1)?;
    let raw = if value.kind() == "jsx_expression" {
        &source[value.start_byte() + 1..value.end_byte() - 1]
    } else {
        return None;
    };
    let separator = raw
        .match_indices("in")
        .find(|(index, _)| {
            raw[..*index].ends_with(char::is_whitespace)
                && raw[*index + 2..].starts_with(char::is_whitespace)
        })?
        .0;
    let params = raw[..separator].trim();
    let params = params
        .strip_prefix('(')
        .and_then(|value| value.strip_suffix(')'))
        .unwrap_or(params);
    let names: Vec<_> = params.split(',').map(str::trim).collect();
    if !(1..=2).contains(&names.len()) || names.iter().any(|name| !is_identifier(name)) {
        return None;
    }
    let iterable = raw[separator + 2..].trim();
    if iterable.is_empty() {
        return None;
    }
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
        .ok()?;
    let expression = format!("({iterable}).map(({}) => null)", names.join(", "));
    let tree = parser.parse(&expression, None)?;
    if tree.root_node().has_error() || tree.root_node().named_child_count() != 1 {
        return None;
    }
    Some((names.join(", "), iterable.to_string()))
}

pub(crate) fn wrap_for(
    node: Node<'_>,
    source: &str,
    config: &Config,
    rendered: String,
    conditional_branch: bool,
) -> String {
    if !is_jsx_node(node.kind()) {
        return rendered;
    }
    let binding = opening_element(node).and_then(|opening| {
        attributes(opening).into_iter().find_map(|attr| {
            (attribute_name(attr, source) == Some(&format!("{}for", config.prefix)))
                .then(|| loop_binding(attr, source))
                .flatten()
        })
    });
    let Some((params, iterable)) = binding else {
        return rendered;
    };
    let expression = format!("({iterable}).map(({params}) => ({rendered}))");
    if !conditional_branch
        && node
            .parent()
            .is_some_and(|parent| is_jsx_container(parent.kind()))
    {
        format!("{{{expression}}}")
    } else {
        format!("({expression})")
    }
}

