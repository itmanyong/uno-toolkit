// napi 转换入口：格式过滤 → 快速路径 → 简写归一 → 解析 → 渲染 → 结果收集。
use napi::bindgen_prelude::*;
use std::collections::HashSet;
use tree_sitter::Parser;

use crate::jsx_directive::directives::v_memo::collect_memo_errors;
use crate::jsx_directive::parser::TSX_PARSER;
use crate::jsx_directive::render::render_node;
use crate::jsx_directive::shorthand::normalize_shorthand;
use crate::jsx_directive::types::{Config, TransformOptions, TransformResult};
use crate::jsx_directive::utils::has_directive_candidate;

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
            errors: Vec::new(),
        });
    }
    if !has_directive_candidate(&code, &config.prefix) {
        return Ok(TransformResult {
            code,
            warnings: Vec::new(),
            errors: Vec::new(),
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

    let mut errors = Vec::new();
    if config.memo == "error" {
        collect_memo_errors(tree.root_node(), &code, &config.prefix, &mut errors);
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
        errors,
    })
}

