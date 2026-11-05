// 入口：napi 转换主流程，解析 TSX、筛出候选函数、生成注入代码并输出 TransformResult。

use napi::bindgen_prelude::*;
use std::cell::RefCell;
use tree_sitter::Parser;

use crate::TransformResult;

use super::detect::{collect_candidates, should_transform};
use super::inject::{apply_edits, build_import, import_position, unique_identifier};
use super::types::{Config, Edit, TransformOptions};

thread_local! {
    static TSX_PARSER: RefCell<Option<Parser>> = const { RefCell::new(None) };
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
