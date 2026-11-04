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
            .parse(&code, None)
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
    ["if", "else-if", "else", "show"]
        .iter()
        .any(|directive| source.contains(&format!("{prefix}{directive}")))
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
        return render_opening_element(node, source, config, warnings, strip_own_condition);
    }

    let mut children = Vec::new();
    let mut cursor = node.walk();
    children.extend(node.named_children(&mut cursor));
    let mut edits = Vec::new();
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

    Ok(apply_edits(
        source,
        node.start_byte(),
        node.end_byte(),
        edits,
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
        .expect("fixture should transform")
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
