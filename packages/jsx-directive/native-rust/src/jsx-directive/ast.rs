// tree-sitter AST 查询辅助：属性读取、JSX 节点分类、注释/空白透明性判定。
use tree_sitter::Node;

pub(crate) fn is_jsx_container(kind: &str) -> bool {
    matches!(kind, "jsx_element" | "jsx_fragment")
}

pub(crate) fn is_jsx_node(kind: &str) -> bool {
    matches!(kind, "jsx_element" | "jsx_self_closing_element")
}

pub(crate) fn jsx_comment_as_js(comment: &str) -> String {
    let comment = comment.trim();
    let content = comment
        .strip_prefix("{/*")
        .and_then(|value| value.strip_suffix("*/}"))
        .or_else(|| {
            comment
                .strip_prefix("/*")
                .and_then(|value| value.strip_suffix("*/"))
        })
        .or_else(|| comment.strip_prefix("//"))
        .unwrap_or(comment)
        .replace("*/", "* /");
    format!(" /*{content}*/ ")
}

pub(crate) fn opening_element(node: Node<'_>) -> Option<Node<'_>> {
    if node.kind() == "jsx_self_closing_element" {
        return Some(node);
    }
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .find(|child| child.kind() == "jsx_opening_element")
}

pub(crate) fn attributes(node: Node<'_>) -> Vec<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .filter(|child| child.kind() == "jsx_attribute")
        .collect()
}

pub(crate) fn attribute_name<'a>(attribute: Node<'_>, source: &'a str) -> Option<&'a str> {
    let mut cursor = attribute.walk();
    let name = attribute.named_children(&mut cursor).next()?;
    Some(&source[name.start_byte()..name.end_byte()])
}

pub(crate) fn attribute_expression(attribute: Node<'_>, source: &str) -> Option<String> {
    let mut cursor = attribute.walk();
    let expression = attribute
        .named_children(&mut cursor)
        .find(|child| child.kind() == "jsx_expression")?;
    let text = &source[expression.start_byte()..expression.end_byte()];
    let inner = text.strip_prefix('{')?.strip_suffix('}')?.trim();
    (!inner.is_empty()).then(|| inner.to_string())
}

pub(crate) fn attribute_value(attribute: Node<'_>, source: &str) -> Option<String> {
    if let Some(expression) = attribute_expression(attribute, source) {
        return Some(expression);
    }
    let value = attribute.named_child(1)?;
    (value.kind() == "string").then(|| source[value.start_byte()..value.end_byte()].to_string())
}

pub(crate) fn directive_expression(attribute: Node<'_>, source: &str) -> Option<String> {
    attribute_expression(attribute, source)
}

pub(crate) fn is_comment(node: Node<'_>, source: &str) -> bool {
    if node.kind() == "comment" {
        return true;
    }
    if node.kind() != "jsx_expression" {
        return false;
    }
    let text = source[node.start_byte()..node.end_byte()].trim();
    text.starts_with("{/*") && text.ends_with("*/}")
}

pub(crate) fn only_transparent_between(children: &[Node<'_>], from: usize, to: usize, source: &str) -> bool {
    let mut cursor = children[from].end_byte();
    for node in &children[from + 1..to] {
        if !is_transparent(*node, source) || !source[cursor..node.start_byte()].trim().is_empty() {
            return false;
        }
        cursor = node.end_byte();
    }
    source[cursor..children[to].start_byte()].trim().is_empty()
}

pub(crate) fn is_whitespace_text(node: Node<'_>, source: &str) -> bool {
    node.kind() == "jsx_text" && source[node.start_byte()..node.end_byte()].trim().is_empty()
}

pub(crate) fn is_transparent(node: Node<'_>, source: &str) -> bool {
    is_comment(node, source) || is_whitespace_text(node, source)
}

pub(crate) fn comment_text(node: Node<'_>, source: &str) -> Option<String> {
    is_comment(node, source).then(|| source[node.start_byte()..node.end_byte()].to_string())
}

