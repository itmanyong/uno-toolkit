// 候选检测：遍历语法树收集函数候选，判断 JSX / 信号访问 / 注释标记并决定是否转换。

use tree_sitter::Node;

use super::types::{Candidate, Config};

pub(crate) fn collect_candidates(
    node: Node<'_>,
    source: &str,
    filename: &str,
    config: &Config,
    candidates: &mut Vec<Candidate>,
) {
    if is_function(node.kind()) {
        if let Some(candidate) = candidate_for(node, source, filename, config) {
            candidates.push(candidate);
        }
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_candidates(child, source, filename, config, candidates);
    }
}

fn candidate_for(
    node: Node<'_>,
    source: &str,
    filename: &str,
    config: &Config,
) -> Option<Candidate> {
    let body = node.child_by_field_name("body")?;
    let name = function_name(node, source, filename);
    let is_component = name
        .as_deref()
        .and_then(|value| value.chars().next())
        .is_some_and(char::is_uppercase);
    let is_hook = name.as_deref().is_some_and(is_hook_name);
    let has_jsx = contains_jsx(body, source, config);
    let uses_signal = contains_signal_access(body, source);
    let node_start = node.start_byte();
    let leading = &source[..node_start];
    Some(Candidate {
        body_start: body.start_byte(),
        body_end: body.end_byte(),
        is_block: body.kind() == "statement_block",
        opted_in: has_comment_tag(leading, &["@useSignals", "@trackSignals"]),
        opted_out: has_comment_tag(leading, &["@noUseSignals", "@noTrackSignals"]),
        is_component,
        is_hook,
        has_jsx,
        uses_signal,
    })
}

pub(crate) fn should_transform(candidate: &Candidate, config: &Config) -> bool {
    if candidate.opted_out {
        return false;
    }
    if candidate.opted_in {
        return true;
    }
    match config.mode.as_str() {
        "manual" => false,
        "all" => candidate.is_component && candidate.has_jsx,
        _ => {
            candidate.uses_signal
                && ((candidate.is_component && candidate.has_jsx) || candidate.is_hook)
        }
    }
}

fn is_function(kind: &str) -> bool {
    matches!(
        kind,
        "function_declaration"
            | "function_expression"
            | "arrow_function"
            | "method_definition"
            | "generator_function"
            | "generator_function_declaration"
    )
}

fn function_name(node: Node<'_>, source: &str, filename: &str) -> Option<String> {
    if let Some(name) = node.child_by_field_name("name") {
        let value = source[name.start_byte()..name.end_byte()].trim();
        if !value.is_empty() {
            return Some(value.trim_matches(['\'', '"', '`']).to_string());
        }
    }

    let mut parent = node.parent()?;
    loop {
        match parent.kind() {
            "variable_declarator" => {
                if let Some(name) = parent.child_by_field_name("name") {
                    if name.kind() == "identifier" {
                        return Some(source[name.start_byte()..name.end_byte()].to_string());
                    }
                }
            }
            "assignment_expression" => {
                if let Some(left) = parent.child_by_field_name("left") {
                    let text = &source[left.start_byte()..left.end_byte()];
                    return text.rsplit('.').next().map(str::to_string);
                }
            }
            "method_definition" | "pair" => {
                if let Some(name) = parent.child_by_field_name("name") {
                    return Some(source[name.start_byte()..name.end_byte()].to_string());
                }
            }
            "export_statement" => {
                let text = &source[parent.start_byte()..parent.end_byte()];
                if text.trim_start().starts_with("export default") {
                    return filename
                        .rsplit(['/', '\\'])
                        .next()
                        .map(|name| name.split('.').next().unwrap_or(name).to_string());
                }
            }
            _ => {}
        }
        if is_function(parent.kind()) || parent.kind() == "program" {
            break;
        }
        parent = parent.parent()?;
    }
    None
}

fn is_hook_name(name: &str) -> bool {
    name.strip_prefix("use")
        .and_then(|suffix| suffix.chars().next())
        .is_some_and(char::is_uppercase)
}

fn contains_jsx(node: Node<'_>, source: &str, config: &Config) -> bool {
    if matches!(
        node.kind(),
        "jsx_element" | "jsx_fragment" | "jsx_self_closing_element"
    ) {
        return true;
    }
    if config.detect_transformed_jsx {
        let text = &source[node.start_byte()..node.end_byte()];
        if ["jsx(", "jsxs(", "jsxDEV(", "createElement("]
            .iter()
            .any(|pattern| text.contains(pattern))
        {
            return true;
        }
    }
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .any(|child| contains_jsx(child, source, config))
}

fn contains_signal_access(node: Node<'_>, source: &str) -> bool {
    if node.kind() == "member_expression" {
        if let Some(property) = node.child_by_field_name("property") {
            if source[property.start_byte()..property.end_byte()].trim_matches(['\'', '"'])
                == "value"
            {
                return true;
            }
        }
    }
    if node.kind() == "object_pattern" {
        let mut cursor = node.walk();
        for property in node.named_children(&mut cursor) {
            if property.kind() == "shorthand_property_identifier_pattern"
                && &source[property.start_byte()..property.end_byte()] == "value"
            {
                return true;
            }
            if property.kind() == "pair_pattern" {
                if let Some(key) = property.child_by_field_name("key") {
                    if &source[key.start_byte()..key.end_byte()] == "value" {
                        return true;
                    }
                }
            }
        }
    }
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .any(|child| contains_signal_access(child, source))
}

fn has_comment_tag(source: &str, tags: &[&str]) -> bool {
    let mut tail_start = source.len().saturating_sub(512);
    while !source.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    let tail = &source[tail_start..];
    let comment_start = tail.rfind("/*").into_iter().chain(tail.rfind("//")).max();
    let Some(start) = comment_start else {
        return false;
    };
    let comment = &tail[start..];
    tags.iter().any(|tag| {
        comment.match_indices(tag).any(|(index, _)| {
            let before = comment[..index].chars().next_back();
            let after = comment[index + tag.len()..].chars().next();
            before.is_none_or(|value| !is_identifier_char(value))
                && after.is_none_or(|value| !is_identifier_char(value))
        })
    })
}

fn is_identifier_char(value: char) -> bool {
    value.is_ascii_alphanumeric() || value == '_'
}
