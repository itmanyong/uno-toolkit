fn fresh_parameter(source: &str, base: &str) -> String {
    if !source.contains(base) {
        return base.to_string();
    }
    let mut suffix = 1;
    loop {
        let candidate = format!("{base}{suffix}");
        if !source.contains(&candidate) {
            return candidate;
        }
        suffix += 1;
    }
}

fn jsx_can_start(before: &str) -> bool {
    let before = before.trim_end();
    before.is_empty()
        || ["=>", "&&", "||"]
            .iter()
            .any(|operator| before.ends_with(operator))
        || before.ends_with(['=', '(', '[', '{', ',', ':', ';', '?'])
        || ["return", "throw", "yield"]
            .iter()
            .any(|keyword| before.ends_with(keyword))
}

fn looks_like_generic(source: &str, start: usize) -> bool {
    let Some(relative_end) = source[start..].find('>') else {
        return false;
    };
    let end = start + relative_end;
    source[start + 1..end].contains(',') && source[end + 1..].trim_start().starts_with('(')
}

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Deserialize;
use std::cell::RefCell;
use std::collections::HashSet;
use tree_sitter::{Node, Parser};

thread_local! {
    static TSX_PARSER: RefCell<Option<Parser>> = const { RefCell::new(None) };
}

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub prefix: Option<String>,
    pub formats: Option<Vec<String>>,
    pub if_fallback: Option<String>,
    pub show_property: Option<String>,
    pub show_true_value: Option<String>,
    pub show_false_value: Option<String>,
}

#[napi(object)]
pub struct Warning {
    pub message: String,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub warnings: Vec<Warning>,
}

#[derive(Clone)]
struct Config {
    prefix: String,
    formats: Vec<String>,
    if_fallback: String,
    show_property: String,
    show_true_value: String,
    show_false_value: String,
}

impl From<Option<TransformOptions>> for Config {
    fn from(options: Option<TransformOptions>) -> Self {
        let options = options.unwrap_or_default();
        Self {
            prefix: options.prefix.unwrap_or_else(|| "v-".into()),
            formats: options
                .formats
                .unwrap_or_else(|| vec!["jsx".into(), "tsx".into()]),
            if_fallback: options.if_fallback.unwrap_or_else(|| "null".into()),
            show_property: options.show_property.unwrap_or_else(|| "display".into()),
            show_true_value: options
                .show_true_value
                .unwrap_or_else(|| "undefined".into()),
            show_false_value: options.show_false_value.unwrap_or_else(|| "'none'".into()),
        }
    }
}

#[derive(Clone)]
struct Edit {
    start: usize,
    end: usize,
    replacement: String,
}

pub fn jsx_directive(
    code: String,
    filename: String,
    options: Option<TransformOptions>,
) -> Result<TransformResult> {
    let config = Config::from(options);
    let extension = filename.rsplit('.').next().unwrap_or_default();
    if !config.formats.iter().any(|format| {
        format
            .trim_start_matches('.')
            .eq_ignore_ascii_case(extension)
    }) {
        return Ok(TransformResult {
            code,
            warnings: Vec::new(),
        });
    }
    if !has_directive_candidate(&code, &config.prefix) {
        return Ok(TransformResult {
            code,
            warnings: Vec::new(),
        });
    }

    let mut parse_source = code.as_bytes().to_vec();
    normalize_shorthand(&code, &mut parse_source, 0, false);
    let tree = TSX_PARSER.with(|parser_cell| {
        let mut parser_slot = parser_cell
            .try_borrow_mut()
            .map_err(|_| Error::from_reason("TSX parser is already in use"))?;
        if parser_slot.is_none() {
            let mut parser = Parser::new();
            parser
                .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
                .map_err(|error| {
                    Error::from_reason(format!("Unable to initialize TSX parser: {error}"))
                })?;
            *parser_slot = Some(parser);
        }
        parser_slot
            .as_mut()
            .expect("parser initialized")
            .parse(&parse_source, None)
            .ok_or_else(|| Error::from_reason("Unable to parse JSX/TSX source"))
    })?;
    if tree.root_node().has_error() {
        return Err(Error::from_reason(format!(
            "Unable to transform invalid JSX/TSX in {filename}"
        )));
    }

    let mut warnings = Vec::new();
    let transformed = render_node(tree.root_node(), &code, &config, &mut warnings, false)?;
    let mut seen_warnings = HashSet::new();
    warnings.retain(|warning| {
        seen_warnings.insert((warning.start, warning.end, warning.message.clone()))
    });
    Ok(TransformResult {
        code: transformed,
        warnings,
    })
}

fn has_directive_candidate(source: &str, prefix: &str) -> bool {
    [
        "if", "else-if", "else", "show", "html", "text", "for", "bind", "model",
    ]
    .iter()
    .any(|directive| source.contains(&format!("{prefix}{directive}")))
        || (source.contains('<')
            && source.match_indices(':').any(|(index, _)| {
                index > 0
                    && source.as_bytes()[index - 1].is_ascii_whitespace()
                    && source.as_bytes().get(index + 1).is_some_and(|next| {
                        next.is_ascii_alphabetic() || *next >= 128 || matches!(next, b'_' | b'$')
                    })
            }))
}

// 仅替换开标签属性位置的冒号，保持字节长度，以便 AST 偏移继续对应原始源码。
fn normalize_shorthand(
    source: &str,
    output: &mut [u8],
    mut index: usize,
    expression: bool,
) -> usize {
    let bytes = source.as_bytes();
    while index < bytes.len() {
        match bytes[index] {
            b'\'' | b'"' | b'`' => {
                let quote = bytes[index];
                index += 1;
                while index < bytes.len() && bytes[index] != quote {
                    if bytes[index] == b'\\' {
                        index += 2;
                    } else if quote == b'`' && bytes[index..].starts_with(b"${") {
                        index = normalize_shorthand(source, output, index + 2, true);
                    } else {
                        index += 1;
                    }
                }
                index += usize::from(index < bytes.len());
            }
            b'/' if bytes[index..].starts_with(b"//") => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            b'/' if bytes[index..].starts_with(b"/*") => {
                index += 2;
                while index + 1 < bytes.len() && !bytes[index..].starts_with(b"*/") {
                    index += 1;
                }
                index = (index + 2).min(bytes.len());
            }
            b'/' if regex_can_start(&source[..index]) => {
                index += 1;
                let mut character_class = false;
                while index < bytes.len() {
                    match bytes[index] {
                        b'\\' => {
                            index += 2;
                            continue;
                        }
                        b'[' => character_class = true,
                        b']' => character_class = false,
                        b'/' if !character_class => {
                            index += 1;
                            break;
                        }
                        b'\n' => break,
                        _ => {}
                    }
                    index += 1;
                }
            }
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b'}' if expression => return index + 1,
            b'<' if jsx_can_start(&source[..index])
                && !looks_like_generic(source, index)
                && bytes.get(index + 1).is_some_and(|next| {
                    next.is_ascii_alphabetic() || matches!(next, b'_' | b'$' | b'>')
                }) =>
            {
                index = normalize_jsx_tag(source, output, index);
            }
            _ => index += 1,
        }
    }
    index
}

fn regex_can_start(before: &str) -> bool {
    let before = before.trim_end();
    before.is_empty()
        || before.ends_with(['=', '(', '[', '{', ',', ':', ';', '!', '?', '&', '|'])
        || ["return", "throw", "case", "yield"]
            .iter()
            .any(|word| before.ends_with(word))
}

fn normalize_jsx_tag(source: &str, output: &mut [u8], start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut index = start + 1;
    while index < bytes.len()
        && (bytes[index].is_ascii_alphanumeric()
            || bytes[index] >= 128
            || matches!(bytes[index], b'_' | b'$' | b'-' | b'.' | b':'))
    {
        index += 1;
    }
    let tag = &source[start + 1..index];
    while index < bytes.len() {
        match bytes[index] {
            b'\'' | b'"' => {
                let quote = bytes[index];
                index += 1;
                while index < bytes.len() && bytes[index] != quote {
                    index += 1;
                }
                index += usize::from(index < bytes.len());
            }
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b':' if index > start
                && bytes[index - 1].is_ascii_whitespace()
                && bytes.get(index + 1).is_some_and(|next| {
                    next.is_ascii_alphabetic() || *next >= 128 || matches!(next, b'_' | b'$')
                }) =>
            {
                output[index] = b'$';
                index += 1;
            }
            b'>' => {
                let self_closing = bytes[index - 1] == b'/';
                index += 1;
                if self_closing || !source[index..].contains(&format!("</{tag}")) {
                    return index;
                }
                break;
            }
            _ => index += 1,
        }
    }
    while index < bytes.len() {
        if bytes[index..].starts_with(b"</") {
            while index < bytes.len() && bytes[index] != b'>' {
                index += 1;
            }
            return (index + 1).min(bytes.len());
        }
        match bytes[index] {
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b'<' if bytes.get(index + 1).is_some_and(|next| {
                next.is_ascii_alphabetic() || matches!(next, b'_' | b'$' | b'>')
            }) =>
            {
                index = normalize_jsx_tag(source, output, index)
            }
            _ => index += 1,
        }
    }
    index
}

fn render_node(
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

fn is_jsx_container(kind: &str) -> bool {
    matches!(kind, "jsx_element" | "jsx_fragment")
}

fn is_jsx_node(kind: &str) -> bool {
    matches!(kind, "jsx_element" | "jsx_self_closing_element")
}

fn add_sequence_edits(
    parent: Node<'_>,
    children: &[Node<'_>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
    edits: &mut Vec<Edit>,
) -> Result<Vec<bool>> {
    let jsx = is_jsx_container(parent.kind());
    let mut eligible = vec![false; children.len()];
    if jsx {
        let mut in_children = false;
        for (index, child) in children.iter().enumerate() {
            if child.kind() == "jsx_opening_element" || child.kind() == "jsx_opening_fragment" {
                in_children = true;
                continue;
            }
            if child.kind() == "jsx_closing_element" || child.kind() == "jsx_closing_fragment" {
                in_children = false;
            }
            eligible[index] = in_children && is_jsx_node(child.kind());
        }
    } else {
        for (index, child) in children.iter().enumerate() {
            eligible[index] = is_jsx_node(child.kind());
        }
    }

    let mut covered = vec![false; children.len()];
    let mut index = 0;
    while index < children.len() {
        if !eligible[index] {
            index += 1;
            continue;
        }
        let node = children[index];
        let condition = match directive_for(node, source, config, warnings)? {
            Some(Directive::If(condition)) => condition,
            Some(Directive::ElseIf(_) | Directive::Else) => {
                warn_orphan(node, source, config, warnings)?;
                index += 1;
                continue;
            }
            None => {
                index += 1;
                continue;
            }
        };

        let mut branches = vec![(index, condition)];
        let mut comments = Vec::new();
        let mut cursor = index + 1;

        loop {
            let mut next = cursor;
            let mut between = Vec::new();
            while next < children.len() && is_transparent(children[next], source) {
                if let Some(comment) = comment_text(children[next], source) {
                    between.push(comment);
                }
                next += 1;
            }
            if next >= children.len() || !eligible[next] {
                break;
            }
            if !only_transparent_between(children, cursor - 1, next, source) {
                break;
            }
            match directive_for(children[next], source, config, warnings)? {
                Some(Directive::ElseIf(condition)) => {
                    comments.push(between);
                    branches.push((next, condition));
                    cursor = next + 1;
                }
                Some(Directive::Else) => {
                    comments.push(between);
                    branches.push((next, String::new()));
                    break;
                }
                _ => break,
            }
        }

        let last_branch_index = branches.last().map(|branch| branch.0).unwrap_or(index);
        let mut replacement = String::new();
        if jsx {
            replacement.push('{');
        } else {
            replacement.push('(');
        }
        replacement.push_str(&build_conditional(
            &branches, children, &comments, source, config, warnings,
        )?);
        if jsx {
            replacement.push('}');
        } else {
            replacement.push(')');
        }

        let start = children[index].start_byte();
        let end = children[last_branch_index].end_byte();
        covered[index..=last_branch_index].fill(true);
        edits.push(Edit {
            start,
            end,
            replacement,
        });
        index = last_branch_index + 1;
    }

    Ok(covered)
}

fn build_conditional(
    branches: &[(usize, String)],
    children: &[Node<'_>],
    comments: &[Vec<String>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> Result<String> {
    let rendered_branches = branches
        .iter()
        .map(|(index, condition)| {
            render_node(children[*index], source, config, warnings, true)
                .map(|branch| (condition, branch))
        })
        .collect::<Result<Vec<_>>>()?;

    let has_else = rendered_branches
        .last()
        .is_some_and(|(condition, _)| condition.is_empty());
    let conditional_count = rendered_branches.len() - usize::from(has_else);
    let mut result = if has_else {
        format!(
            "({})",
            rendered_branches.last().expect("else branch exists").1
        )
    } else {
        config.if_fallback.clone()
    };

    for branch_index in (0..conditional_count).rev() {
        let (condition, branch) = &rendered_branches[branch_index];
        let comments = comments
            .get(branch_index)
            .into_iter()
            .flatten()
            .map(|comment| jsx_comment_as_js(comment))
            .collect::<String>();
        result = format!("({condition}) ? ({branch}) : {comments}({result})");
    }
    Ok(result)
}

fn jsx_comment_as_js(comment: &str) -> String {
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

enum Directive {
    If(String),
    ElseIf(String),
    Else,
}

fn directive_for(
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

fn opening_element(node: Node<'_>) -> Option<Node<'_>> {
    if node.kind() == "jsx_self_closing_element" {
        return Some(node);
    }
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .find(|child| child.kind() == "jsx_opening_element")
}

fn attributes(node: Node<'_>) -> Vec<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .filter(|child| child.kind() == "jsx_attribute")
        .collect()
}

fn attribute_name<'a>(attribute: Node<'_>, source: &'a str) -> Option<&'a str> {
    let mut cursor = attribute.walk();
    let name = attribute.named_children(&mut cursor).next()?;
    Some(&source[name.start_byte()..name.end_byte()])
}

fn attribute_expression(attribute: Node<'_>, source: &str) -> Option<String> {
    let mut cursor = attribute.walk();
    let expression = attribute
        .named_children(&mut cursor)
        .find(|child| child.kind() == "jsx_expression")?;
    let text = &source[expression.start_byte()..expression.end_byte()];
    let inner = text.strip_prefix('{')?.strip_suffix('}')?.trim();
    (!inner.is_empty()).then(|| inner.to_string())
}

fn attribute_value(attribute: Node<'_>, source: &str) -> Option<String> {
    if let Some(expression) = attribute_expression(attribute, source) {
        return Some(expression);
    }
    let value = attribute.named_child(1)?;
    (value.kind() == "string").then(|| source[value.start_byte()..value.end_byte()].to_string())
}

fn loop_binding(attribute: Node<'_>, source: &str) -> Option<(String, String)> {
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

fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars
        .next()
        .is_some_and(|ch| ch.is_alphabetic() || ch == '_' || ch == '$')
        && chars.all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '$')
}

fn wrap_for(
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

fn directive_expression(attribute: Node<'_>, source: &str) -> Option<String> {
    attribute_expression(attribute, source)
}

fn model_binding(attribute: Node<'_>, source: &str) -> Option<(String, String)> {
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

fn model_expression(value: Node<'_>, source: &str) -> Option<(String, String)> {
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

fn render_model(
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
            "v-model requires an identifier or [value, setter] expression",
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
                    || attr_name == Some(&format!("{}bind:{name}", config.prefix))
                    || attr_name == Some(&format!(":{name}"))
            })
            .copied()
    };
    let read_value = |attr| {
        if attribute_name(attr, source).is_some_and(|name| {
            name.starts_with(':') || name.starts_with(&format!("{}bind:", config.prefix))
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
            return invalid(warnings, "v-model requires a valid property name");
        }
        let mut chars = property.chars();
        let event = format!("onUpdate{}{}", chars.next()?.to_uppercase(), chars.as_str());
        if find(property).is_some() || find(&event).is_some() {
            return invalid(
                warnings,
                "v-model conflicts with an existing model property or update handler",
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
        return invalid(warnings, "v-model requires a static input type");
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
                    "v-model on radio inputs requires a value attribute",
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
                "v-model supports input, textarea, select and custom components",
            );
        }
    };
    if find(property).is_some() || find("onChange").is_some() {
        return invalid(
            warnings,
            "v-model conflicts with an existing value, checked or onChange attribute",
        );
    }
    let event_parameter = fresh_parameter(source, "event");
    let update = update?.replace("__MODEL_EVENT__", &event_parameter);
    let handler = format!("{event_parameter} => ({setter})({update})");
    Some(format!("{property}={{{binding}}} onChange={{{handler}}}"))
}

fn is_comment(node: Node<'_>, source: &str) -> bool {
    if node.kind() == "comment" {
        return true;
    }
    if node.kind() != "jsx_expression" {
        return false;
    }
    let text = source[node.start_byte()..node.end_byte()].trim();
    text.starts_with("{/*") && text.ends_with("*/}")
}

fn only_transparent_between(children: &[Node<'_>], from: usize, to: usize, source: &str) -> bool {
    let mut cursor = children[from].end_byte();
    for node in &children[from + 1..to] {
        if !is_transparent(*node, source) || !source[cursor..node.start_byte()].trim().is_empty() {
            return false;
        }
        cursor = node.end_byte();
    }
    source[cursor..children[to].start_byte()].trim().is_empty()
}

fn is_whitespace_text(node: Node<'_>, source: &str) -> bool {
    node.kind() == "jsx_text" && source[node.start_byte()..node.end_byte()].trim().is_empty()
}

fn is_transparent(node: Node<'_>, source: &str) -> bool {
    is_comment(node, source) || is_whitespace_text(node, source)
}

fn comment_text(node: Node<'_>, source: &str) -> Option<String> {
    is_comment(node, source).then(|| source[node.start_byte()..node.end_byte()].to_string())
}

fn warn_orphan(
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

fn render_opening_element(
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
    for attribute in &attrs {
        let Some(name) = attribute_name(*attribute, source) else {
            continue;
        };
        let suffix = name.strip_prefix(&config.prefix).unwrap_or_default();
        let replacement = if let Some(argument) = suffix
            .strip_prefix("bind:")
            .or_else(|| name.strip_prefix(':'))
        {
            if argument.is_empty() {
                None
            } else {
                let expression = directive_expression(*attribute, source);
                if expression.is_none() {
                    warnings.push(Warning {
                        message: format!(
                            "{name} must use JSX expression syntax, for example {name}={{value}}"
                        ),
                        start: attribute.start_byte() as u32,
                        end: attribute.end_byte() as u32,
                    });
                }
                expression.map(|expression| format!("{argument}={{{expression}}}"))
            }
        } else if suffix == "model" || suffix.starts_with("model:") {
            render_model(node, *attribute, &attrs, source, config, warnings)
        } else if suffix == "bind" {
            let expression = directive_expression(*attribute, source);
            if expression.is_none() {
                warnings.push(Warning {
                    message: format!(
                        "{name} must use JSX expression syntax, for example {name}={{attrs}}"
                    ),
                    start: attribute.start_byte() as u32,
                    end: attribute.end_byte() as u32,
                });
            }
            expression.map(|expression| format!("{{...({expression})}}"))
        } else if !has_html || !has_text {
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
    }

    Ok(apply_edits(
        source,
        node.start_byte(),
        node.end_byte(),
        edits,
    ))
}

fn apply_edits(source: &str, start: usize, end: usize, mut edits: Vec<Edit>) -> String {
    edits.sort_by_key(|edit| (edit.start, edit.end));
    let mut output = String::new();
    let mut cursor = start;
    for edit in edits {
        if edit.start < cursor || edit.end > end {
            continue;
        }
        output.push_str(&source[cursor..edit.start]);
        output.push_str(&edit.replacement);
        cursor = edit.end;
    }
    output.push_str(&source[cursor..end]);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform_source(source: &str) -> TransformResult {
        jsx_directive(
            source.into(),
            "fixture.tsx".into(),
            Some(TransformOptions::default()),
        )
        .unwrap_or_else(|error| panic!("fixture should transform: {error}; source={source}"))
    }

    fn assert_tsx_parses(source: &str) {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("TSX parser should initialize");
        let tree = parser.parse(source, None).expect("TSX should parse");
        assert!(!tree.root_node().has_error(), "{source}");
    }

    #[test]
    fn 列表支持根节点嵌套与条件优先级() {
        for source in [
            "const view = <li v-for={item in items}>{item}</li>",
            "<ul><li v-for={(item, index) in items} key={index}>{item}</li></ul>",
            "<><Item v-if={ready} v-for={item in items} item={item} /><Empty v-else /></>",
            "<ul><li v-for={item in items}><b v-for={child in item.children}>{child}</b></li></ul>",
        ] {
            let result = transform_source(source);
            assert!(result.warnings.is_empty(), "{source}");
            assert!(!result.code.contains("v-for"), "{}", result.code);
            assert!(result.code.contains(".map((item"), "{}", result.code);
            assert_tsx_parses(&result.code);
        }
        let result = transform_source("<Item v-if={ready} v-for={item in items} />");
        assert!(result.code.find("(ready) ?").unwrap() < result.code.find(".map").unwrap());
        for source in [
            "<Item v-for=\"item in items\" />",
            "<div v-bind:title=\"title\" />",
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, source);
            assert_eq!(result.warnings.len(), 1);
        }
    }

    #[test]
    fn 模型转换原生控件与自定义组件() {
        for (source, expected) in [
            (
                "<input v-model={firstName} />",
                "value={firstName} onChange={event => (setFirstName)(event.currentTarget.value)}",
            ),
            (
                "<textarea v-model={[text, update]} />",
                "value={text} onChange={event => (update)(event.currentTarget.value)}",
            ),
            (
                "<input type=\"checkbox\" v-model={checked} />",
                "checked={checked} onChange={event => (setChecked)(event.currentTarget.checked)}",
            ),
            (
                "<input type=\"checkbox\" value={option} v-model={choices} />",
                "checked={(choices).includes(option)} onChange={event => (setChoices)(event.currentTarget.checked ? [...(choices), (option)] : (choices).filter(__item => __item !== (option)))}",
            ),
            (
                "<input type=\"radio\" value={option} v-model={choice} />",
                "checked={(choice) === (option)} onChange={event => (setChoice)(option)}",
            ),
            (
                "<select v-model={choice} />",
                "value={choice} onChange={event => (setChoice)(event.currentTarget.value)}",
            ),
            (
                "<select multiple v-model={[choices, update]} />",
                "Array.from(event.currentTarget.selectedOptions, option => option.value)",
            ),
            (
                "<Field v-model={name} />",
                "modelValue={name} onUpdateModelValue={value => (setName)(value)}",
            ),
            (
                "<Field v-model:first={[name, update]} />",
                "first={name} onUpdateFirst={value => (update)(value)}",
            ),
            (
                "<input v-model={keyword} />",
                "value={keyword} onChange={event => (setKeyword)(event.currentTarget.value)}",
            ),
            (
                "<Field v-model={email} />",
                "modelValue={email} onUpdateModelValue={value => (setEmail)(value)}",
            ),
            (
                "<Field v-model:first={[first, update]} />",
                "first={first} onUpdateFirst={value => (update)(value)}",
            ),
            (
                "<input type=\"checkbox\" :value={option} v-model={choices} />",
                "checked={(choices).includes(option)}",
            ),
            (
                "<select multiple={many} v-model={choice} />",
                "event.currentTarget.multiple ? Array.from(event.currentTarget.selectedOptions, option => option.value) : event.currentTarget.value",
            ),
            (
                "<input v-model={[text, event]} />",
                "event1 => (event)(event1.currentTarget.value)",
            ),
            (
                "<Field v-model={[name, value]} />",
                "value1 => (value)(value1)",
            ),
        ] {
            let result = transform_source(source);
            assert!(result.warnings.is_empty(), "{source}");
            assert!(result.code.contains(expected), "{}", result.code);
            assert!(!result.code.contains("v-model"));
            assert_tsx_parses(&result.code);
        }
    }

    #[test]
    fn 模型无效表达式和显式属性冲突保留原文并警告() {
        for source in [
            "<input v-model={state.name} />",
            "<input value={name} v-model={name} />",
            "<Field onUpdateModelValue={update} v-model={name} />",
            "<input type={kind} v-model={name} />",
            "<input v-model={[, name, setter]} />",
            "<input v-model={[name,, setter]} />",
            "<input v-model=\"name\" />",
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, source);
            assert_eq!(result.warnings.len(), 1);
        }
    }

    #[test]
    fn 简写仅转换开标签属性并保持原始偏移() {
        for (source, expected) in [
            ("<div :title={title} />", "<div title={title} />"),
            (
                "const text = '<div :title={title}/>'; const view = <div :title={title} />",
                "const text = '<div :title={title}/>'; const view = <div title={title} />",
            ),
            (
                "/* <div :title={title}/> */ const view = <div :title={title} />",
                "/* <div :title={title}/> */ const view = <div title={title} />",
            ),
            (
                "<div title=\":literal\"> :text 'quote {ok && <span :title={title}/>}</div>",
                "<div title=\":literal\"> :text 'quote {ok && <span title={title}/>}</div>",
            ),
            (
                "const pattern = /<div :title/; const view = <div :title={title} />",
                "const pattern = /<div :title/; const view = <div title={title} />",
            ),
            (
                "const x = `<div :title/> ${<span :title={title}/>}`",
                "const x = `<div :title/> ${<span title={title}/>}`",
            ),
            (
                "const f = <T,>(x: T) => <div :title={title} />",
                "const f = <T,>(x: T) => <div title={title} />",
            ),
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, expected);
            assert_tsx_parses(&result.code);
        }
        let source = "const small = a<b ? c : d; const view = <div v-if={ready} />";
        let result = transform_source(source);
        assert!(result.code.contains("a<b ? c : d"), "{}", result.code);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 内容指令替换原有子节点并处理冲突() {
        let html = transform_source("<div v-html={markup}><span>old</span></div>");
        assert_eq!(
            html.code,
            "<div dangerouslySetInnerHTML={{ __html: markup }}></div>"
        );
        let text = transform_source("<div v-text={message}>old</div>");
        assert_eq!(text.code, "<div >{message}</div>");
        let source = "<div v-html={markup} v-text={message}>old</div>";
        let conflict = transform_source(source);
        assert_eq!(conflict.code, source);
        assert_eq!(conflict.warnings.len(), 1);
        assert_tsx_parses(&html.code);
        assert_tsx_parses(&text.code);
    }

    #[test]
    fn 绑定属性和对象() {
        let result = transform_source("<div v-bind:title={title} v-bind={props} />");
        assert_eq!(result.code, "<div title={title} {...(props)} />");
        assert_tsx_parses(&result.code);
        for source in [
            "<div v-bind:title={title} :id={elementId} v-bind={props} className=\"literal\" />",
            "<div v-bind:title=\"title\" />",
        ] {
            let result = transform_source(source);
            if source == "<div v-bind:title=\"title\" />" {
                assert_eq!(result.code, source);
                assert_eq!(result.warnings.len(), 1);
            } else {
                assert_eq!(
                    result.code,
                    "<div title={title} id={elementId} {...(props)} className=\"literal\" />"
                );
                assert!(result.warnings.is_empty());
            }
            assert_tsx_parses(&result.code);
        }
    }

    #[test]
    fn 相邻条件分支保留注释() {
        let result = transform_source(
            "<><A v-if={first} />{/* keep */}<B v-else-if={second} /><C v-else /></>",
        );

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("/* keep */"));
        assert!(result.code.contains("(second) ? (<B />)"));
        assert!(result.code.contains("(<C />)"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 空白与换行不会中断分支链() {
        let result = transform_source("<><A v-if={first} />\n  <B v-else /></>");

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("<B />"));
        assert!(!result.code.contains("v-else"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 多行缩进的条件链被合并() {
        let result = transform_source(
            "<>\n  <A v-if={first} />\n  <B v-else-if={second} />\n  <C v-else />\n</>",
        );

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("(second) ? (<B />)"));
        assert!(result.code.contains("(<C />)"));
        assert!(!result.code.contains("v-else"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn v_show会合并现有样式() {
        let result = transform_source("<div style={{ color: 'red' }} v-show={visible} />");

        assert!(result.code.contains(
            "style={{...({ color: 'red' }), [\"display\"]: (visible) ? (undefined) : ('none')}}"
        ));
        assert!(!result.code.contains("v-show"));
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 数组分隔符会中断分支链() {
        let result = transform_source("const items = [<A v-if={first} />, <B v-else />];");

        assert!(result.code.contains("(first) ? (<A />) : (null)"));
        assert!(result.code.contains("<B v-else />"));
        assert_eq!(result.warnings.len(), 1);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 函数参数分隔符会中断分支链() {
        let result = transform_source(
            "const result = render(<A v-if={first} />, <B v-else-if={second} />, <C v-else />);",
        );

        assert!(result.code.contains("(first) ? (<A />) : (null)"));
        assert!(result.code.contains("<B v-else-if={second} />"));
        assert!(result.code.contains("<C v-else />"));
        assert_eq!(result.warnings.len(), 2);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 注释周围的空白不会中断分支链() {
        let result = transform_source("<><A v-if={first} /> {/* keep */}<B v-else /></>");

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("/* keep */"));
        assert!(result.code.contains("(<B />)"));
        assert!(!result.code.contains("<B v-else />"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn v_show为自闭合元素创建样式() {
        let result = transform_source("<div v-show={visible} />");

        assert!(
            result
                .code
                .contains("style={{[\"display\"]: (visible) ? (undefined) : ('none')}}")
        );
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 支持自定义前缀和显示值() {
        let result = jsx_directive(
            "<div x-show={active} />".into(),
            "fixture.jsx".into(),
            Some(TransformOptions {
                prefix: Some("x-".into()),
                formats: Some(vec![".jsx".into()]),
                show_property: Some("visibility".into()),
                show_true_value: Some("'visible'".into()),
                show_false_value: Some("'hidden'".into()),
                ..TransformOptions::default()
            }),
        )
        .expect("custom options should transform");

        assert!(
            result
                .code
                .contains("[\"visibility\"]: (active) ? ('visible') : ('hidden')")
        );
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 孤立的v_else保持不变并发出警告() {
        let result = transform_source("<div v-else />");

        assert_eq!(result.code, "<div v-else />");
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].message.contains("Orphaned v-else"));
    }

    #[test]
    fn 孤立的v_else_if和无效v_if语法会发出警告() {
        let orphan = transform_source("<div v-else-if={condition} />");
        let invalid = transform_source("<div v-if=\"condition\" />");

        assert_eq!(orphan.warnings.len(), 1);
        assert!(orphan.warnings[0].message.contains("Orphaned v-else-if"));
        assert_eq!(orphan.code, "<div v-else-if={condition} />");
        assert_eq!(invalid.warnings.len(), 1);
        assert!(
            invalid.warnings[0]
                .message
                .contains("must use expression syntax")
        );
        assert_eq!(invalid.code, "<div v-if=\"condition\" />");
    }

    #[test]
    fn 跳过未配置的文件格式() {
        let source = "<div v-show={visible} />";
        let result = jsx_directive(
            source.into(),
            "fixture.js".into(),
            Some(TransformOptions::default()),
        )
        .expect("unsupported format should be ignored");

        assert_eq!(result.code, source);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 没有指令候选时跳过解析() {
        let source = "const value: = <div />;";
        let result = jsx_directive(
            source.into(),
            "fixture.tsx".into(),
            Some(TransformOptions::default()),
        )
        .expect("source without directives should use the fast path");

        assert_eq!(result.code, source);
        assert!(result.warnings.is_empty());
    }
}
