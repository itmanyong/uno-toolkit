use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Deserialize;
use std::cell::RefCell;
use tree_sitter::{Node, Parser};

use crate::TransformResult;

thread_local! {
    static TSX_PARSER: RefCell<Option<Parser>> = const { RefCell::new(None) };
}

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub mode: Option<String>,
    pub import_source: Option<String>,
    pub detect_transformed_jsx: Option<bool>,
    pub formats: Option<Vec<String>>,
}

#[derive(Clone)]
struct Config {
    mode: String,
    import_source: String,
    detect_transformed_jsx: bool,
    formats: Vec<String>,
}

impl From<TransformOptions> for Config {
    fn from(options: TransformOptions) -> Self {
        Self {
            mode: options.mode.unwrap_or_else(|| "auto".into()),
            import_source: options
                .import_source
                .unwrap_or_else(|| "@preact/signals-react/runtime".into()),
            detect_transformed_jsx: options.detect_transformed_jsx.unwrap_or(false),
            formats: options
                .formats
                .unwrap_or_else(|| vec!["js".into(), "jsx".into(), "ts".into(), "tsx".into()]),
        }
    }
}

#[derive(Clone)]
struct Candidate {
    body_start: usize,
    body_end: usize,
    is_block: bool,
    is_component: bool,
    is_hook: bool,
    opted_in: bool,
    opted_out: bool,
    has_jsx: bool,
    uses_signal: bool,
}

#[derive(Clone)]
struct Edit {
    start: usize,
    end: usize,
    replacement: String,
}

pub fn transform_signals(
    code: String,
    filename: String,
    options: TransformOptions,
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
        return Ok(TransformResult {
            code,
            warnings: Vec::new(),
        });
    }

    let mut candidates = Vec::new();
    collect_candidates(tree.root_node(), &code, &filename, &config, &mut candidates);

    let mut selected = candidates
        .into_iter()
        .filter(|candidate| should_transform(candidate, &config))
        .collect::<Vec<_>>();
    if selected.is_empty() {
        return Ok(TransformResult {
            code,
            warnings: Vec::new(),
        });
    }

    selected.sort_by_key(|candidate| candidate.body_end - candidate.body_start);
    let mut replacements: Vec<Edit> = Vec::new();
    for candidate in &selected {
        let body = &code[candidate.body_start..candidate.body_end];
        let nested = replacements
            .iter()
            .filter(|edit| {
                edit.start >= candidate.body_start
                    && edit.end <= candidate.body_end
                    && !replacements.iter().any(|other| {
                        other.start <= edit.start
                            && other.end >= edit.end
                            && (other.start < edit.start || other.end > edit.end)
                            && other.start >= candidate.body_start
                            && other.end <= candidate.body_end
                    })
            })
            .cloned()
            .collect::<Vec<_>>();
        let transformed_body = apply_edits(body, candidate.body_start, nested);
        let inner = if candidate.is_block {
            transformed_body
                .get(1..transformed_body.len().saturating_sub(1))
                .unwrap_or_default()
                .to_string()
        } else {
            format!("return {transformed_body};")
        };
        let usage = if candidate.is_hook {
            "2"
        } else if candidate.is_component {
            "1"
        } else {
            "0"
        };
        let hook_name = unique_identifier(&code, "_useSignals");
        let replacement = if usage == "0" {
            format!("{{ {hook_name}(0); {inner} }}")
        } else {
            let effect_name = unique_identifier(&code, "_effect");
            format!(
                "{{ var {effect_name} = {hook_name}({usage}); try {{ {inner} }} finally {{ {effect_name}.f(); }} }}"
            )
        };
        replacements.push(Edit {
            start: candidate.body_start,
            end: candidate.body_end,
            replacement,
        });
    }

    let top_level = replacements
        .iter()
        .filter(|edit| {
            !replacements.iter().any(|other| {
                other.start <= edit.start && other.end >= edit.end && other.start < edit.start
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut edits = top_level;
    let hook_name = unique_identifier(&code, "_useSignals");
    let import = build_import(&code, &config.import_source, &hook_name);
    let import_position = import_position(tree.root_node(), &code);
    edits.push(Edit {
        start: import_position,
        end: import_position,
        replacement: import,
    });

    Ok(TransformResult {
        code: apply_edits(&code, 0, edits),
        warnings: Vec::new(),
    })
}

fn collect_candidates(
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

fn should_transform(candidate: &Candidate, config: &Config) -> bool {
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

fn unique_identifier(source: &str, base: &str) -> String {
    if !source.contains(base) {
        return base.to_string();
    }
    (2..)
        .map(|index| format!("{base}{index}"))
        .find(|name| !source.contains(name))
        .expect("an unused generated identifier exists")
}

fn import_position(root: Node<'_>, source: &str) -> usize {
    let mut position = 0;
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        if child.kind() == "import_statement" {
            position = child.end_byte();
        }
    }
    if position == 0 && source.starts_with("#!") {
        return source.find('\n').map_or(source.len(), |index| index + 1);
    }
    position
}

fn build_import(source: &str, import_source: &str, identifier: &str) -> String {
    let module_specifier = serde_json::to_string(import_source)
        .expect("serializing a JavaScript module specifier cannot fail");
    let has_es_module_syntax = source.lines().any(|line| {
        line.trim_start().starts_with("import ") || line.trim_start().starts_with("export ")
    });
    let has_commonjs_syntax = source.contains("require(") || source.contains("module.exports");
    if has_es_module_syntax || !has_commonjs_syntax {
        format!("\nimport {{ useSignals as {identifier} }} from {module_specifier};")
    } else {
        format!("\nvar {identifier} = require({module_specifier}).useSignals;")
    }
}

fn apply_edits(source: &str, offset: usize, mut edits: Vec<Edit>) -> String {
    edits.sort_by(|left, right| right.start.cmp(&left.start));
    let mut result = source.to_string();
    for edit in edits {
        let start = edit.start.saturating_sub(offset);
        let end = edit.end.saturating_sub(offset);
        result.replace_range(start..end, &edit.replacement);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform_source(source: &str, mode: Option<&str>) -> TransformResult {
        transform_signals(
            source.into(),
            "fixture.tsx".into(),
            TransformOptions {
                mode: mode.map(str::to_string),
                ..TransformOptions::default()
            },
        )
        .expect("valid TSX source should transform")
    }

    #[test]
    fn 自动模式为读取信号的组件注入跟踪() {
        let result = transform_source(
            "const count = signal(0); function Counter() { return <p>{count.value}</p>; }",
            None,
        );

        assert!(result.code.contains("_useSignals(1)"));
        assert!(result.code.contains("finally"));
        assert!(
            result
                .code
                .contains("from \"@preact/signals-react/runtime\"")
        );
        assert!(!result.code.contains("function Counter() { return <p>"));
    }

    #[test]
    fn 自动模式为使用信号的自定义钩子注入托管跟踪() {
        let result = transform_source("function useCounter() { return count.value; }", None);

        assert!(result.code.contains("_useSignals(2)"));
        assert!(result.code.contains("_effect.f()"));
    }

    #[test]
    fn 自动模式识别value解构和箭头组件() {
        let destructured = transform_source(
            "function Counter() { const { value } = count; return <p>{value}</p>; }",
            None,
        );
        let arrow = transform_source("const Counter = () => <p>{count.value}</p>;", None);

        assert!(destructured.code.contains("_useSignals(1)"));
        assert!(arrow.code.contains("_useSignals(1)"));
    }

    #[test]
    fn 手动模式需要显式启用并尊重排除标记() {
        let skipped = transform_source(
            "function Counter() { return <p>{count.value}</p>; }",
            Some("manual"),
        );
        let included = transform_source(
            "/** @useSignals */ function Counter() { return <p />; }",
            Some("manual"),
        );
        let opted_out = transform_source(
            "/** @useSignals */ /** @noUseSignals */ function Counter() { return <p />; }",
            Some("all"),
        );

        assert_eq!(
            skipped.code,
            "function Counter() { return <p>{count.value}</p>; }"
        );
        assert!(included.code.contains("_useSignals(1)"));
        assert_eq!(
            opted_out.code,
            "/** @useSignals */ /** @noUseSignals */ function Counter() { return <p />; }"
        );
    }

    #[test]
    fn 全部模式转换未读取信号的组件() {
        let result = transform_source("function Counter() { return <p>static</p>; }", Some("all"));

        assert!(result.code.contains("_useSignals(1)"));
    }

    #[test]
    fn 支持自定义导入源和已转换jsx检测() {
        let result = transform_signals(
            "import { jsx as _jsx } from \"react/jsx-runtime\"; function Counter() { return _jsx(\"p\", { children: count.value }); }"
                .into(),
            "fixture.js".into(),
            TransformOptions {
                import_source: Some("custom-signals".into()),
                detect_transformed_jsx: Some(true),
                ..TransformOptions::default()
            },
        )
        .expect("valid JavaScript source should transform");

        assert!(result.code.contains("from \"custom-signals\""));
        assert!(result.code.contains("_useSignals(1)"));
        assert!(result.code.contains("_jsx(\"p\""));
    }

    #[test]
    fn 跳过无法由类型脚本解析器处理的源码() {
        let source = "const value = await using resource = openResource();";
        let result = transform_source(source, Some("all"));

        assert_eq!(result.code, source);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 转换嵌套组件时保留内部修改() {
        let result = transform_source(
            "function Outer() { function Inner() { return <p>{count.value}</p>; } return <Inner />; }",
            Some("all"),
        );

        assert_eq!(result.code.matches("_useSignals(1)").count(), 2);
    }
}
