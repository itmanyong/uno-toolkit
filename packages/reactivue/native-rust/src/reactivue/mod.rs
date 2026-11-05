//! reactivue 编译期 JSX 切块模块；按职责拆分为 types / utils / ast / jsx / setup 等子模块，
//! 本文件仅保留模块声明、对外重导出与 napi 入口函数。

use napi::bindgen_prelude::*;
use tree_sitter::Parser;

mod ast;
mod jsx;
mod setup;
mod types;
mod utils;

#[cfg(test)]
mod tests;

use self::ast::{
    collect_calls, collect_memo_attrs, collect_react_hooks, contains_hooks, find_render_jsx,
    owner_element,
};
use self::jsx::transform_jsx;
use self::setup::build_import;
use self::types::{Ctx, Edit, Names, RenderKind, Used};
use self::utils::{
    apply_edits, extension_of, import_position, normalized_formats, unique_identifier, warn,
};

#[allow(unused_imports)]
pub use self::types::{TransformOptions, TransformResult, Warning};

/// P3 编译期切块：只处理 defineComponent 内的 JSX，其余仅消费残留 v-memo。
pub fn reactivue_transform(
    code: String,
    filename: String,
    options: Option<TransformOptions>,
) -> Result<TransformResult> {
    let formats = normalized_formats(&options);
    if !formats.contains(&extension_of(&filename)) {
        return Ok(TransformResult {
            code,
            warnings: vec![],
            errors: vec![],
        });
    }

    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
        .map_err(|error| Error::from_reason(format!("TSX 语言初始化失败: {error}")))?;

    let Some(tree) = parser.parse(&code, None) else {
        return Ok(TransformResult {
            code,
            warnings: vec![],
            errors: vec![],
        });
    };
    if tree.root_node().has_error() {
        return Ok(TransformResult {
            code,
            warnings: vec![],
            errors: vec![],
        });
    }

    let opts = options.unwrap_or_default();
    let mut ctx = Ctx {
        source: &code,
        names: Names {
            text: unique_identifier(&code, "_TextBinding"),
            block: unique_identifier(&code, "_Block"),
            memo: unique_identifier(&code, "_MemoBlock"),
            host: unique_identifier(&code, "_createCompiledHost"),
        },
        warnings: Vec::new(),
        errors: Vec::new(),
        strict: opts.strict.unwrap_or(false),
        coarse: opts.granularity.as_deref() == Some("coarse"),
        group: String::new(),
        used: Used::default(),
    };

    let root = tree.root_node();
    let mut calls = Vec::new();
    collect_calls(root, &code, &mut calls);
    let react_hooks = collect_react_hooks(root, &code);

    let mut edits: Vec<Edit> = Vec::new();
    let mut handled: Vec<(usize, usize)> = Vec::new();

    for (index, call) in calls.iter().enumerate() {
        if handled
            .iter()
            .any(|(start, end)| call.start_byte() >= *start && call.end_byte() <= *end)
        {
            continue;
        }
        if contains_hooks(*call, &code, &react_hooks) {
            warn(
                &mut ctx,
                *call,
                "[reactivue] setup 内检测到 React hooks 调用；该 defineComponent 跳过编译期切块（走降级路径）。",
            );
            // 不登记 handled：其中的 v-memo 仍由后面的「残留消费」步骤处理，
            // 避免 R-A 契约下属性残留触发误导性报错。
            continue;
        }
        let Some(function) = call
            .child_by_field_name("arguments")
            .and_then(|arguments| arguments.named_child(0))
        else {
            continue;
        };
        if !matches!(function.kind(), "arrow_function" | "function_expression") {
            continue;
        }
        let Some((jsx, kind)) = find_render_jsx(function, &code) else {
            continue;
        };

        ctx.group = format!("{filename}#{index}");
        let transformed = transform_jsx(jsx, &mut ctx, true);
        let replacement = match kind {
            RenderKind::Direct | RenderKind::ArrowExpression => {
                ctx.used.host = true;
                let wrapped = format!("{{ render: () => ({transformed}) }}");
                if kind == RenderKind::ArrowExpression {
                    format!("({wrapped})")
                } else {
                    wrapped
                }
            }
            RenderKind::Ready => {
                ctx.used.host = true;
                transformed
            }
        };

        edits.push(Edit {
            start: jsx.start_byte(),
            end: jsx.end_byte(),
            replacement,
        });
        if let Some(identifier) = call.child_by_field_name("function") {
            edits.push(Edit {
                start: identifier.start_byte(),
                end: identifier.end_byte(),
                replacement: ctx.names.host.clone(),
            });
        }
        handled.push((call.start_byte(), call.end_byte()));
    }

    // 消费 defineComponent 之外的 v-memo（R-A 契约：输入中不得残留 v-memo）。
    let mut memo_attrs = Vec::new();
    collect_memo_attrs(root, &code, &mut memo_attrs);
    let mut memo_owners: Vec<(usize, usize)> = Vec::new();
    for attr in memo_attrs {
        if handled
            .iter()
            .any(|(start, end)| attr.start_byte() >= *start && attr.end_byte() <= *end)
        {
            continue;
        }
        let Some(element) = owner_element(attr) else {
            continue;
        };
        if memo_owners
            .iter()
            .any(|(start, end)| element.start_byte() >= *start && element.end_byte() <= *end)
        {
            continue;
        }
        memo_owners.push((element.start_byte(), element.end_byte()));
        warn(
            &mut ctx,
            attr,
            "[reactivue] v-memo 位于 defineComponent 之外；仅作为独立刷新块，块内不做文本切分。",
        );
        ctx.group = format!("{filename}#memo{}", memo_owners.len());
        let transformed = transform_jsx(element, &mut ctx, false);
        edits.push(Edit {
            start: element.start_byte(),
            end: element.end_byte(),
            replacement: transformed,
        });
    }

    if let Some(import) = build_import(&ctx) {
        let position = import_position(root, &code);
        edits.push(Edit {
            start: position,
            end: position,
            replacement: import,
        });
    }

    Ok(TransformResult {
        code: apply_edits(&code, 0, edits),
        warnings: ctx.warnings,
        errors: ctx.errors,
    })
}
