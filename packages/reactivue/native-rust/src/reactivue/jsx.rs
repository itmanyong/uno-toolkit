//! JSX 切块核心：递归收集编辑、变换区域、提升为 Block / MemoBlock / TextBinding。

use tree_sitter::Node;

use super::ast::{
    attribute_name, attribute_value, is_ignored_attr, is_jsx, is_text_expr, leading_ws_start,
    open_tag_of, tag_name,
};
use super::types::{Ctx, Edit};
use super::utils::{apply_edits, region, text, warn};

pub(crate) fn collect_jsx_edits(node: Node<'_>, ctx: &mut Ctx<'_>, split: bool, edits: &mut Vec<Edit>) {
    for index in 0..node.named_child_count() {
        let Some(child) = node.named_child(index) else {
            continue;
        };
        if is_jsx(child) {
            edits.push(Edit {
                start: child.start_byte(),
                end: child.end_byte(),
                replacement: transform_jsx(child, ctx, split),
            });
        } else {
            collect_jsx_edits(child, ctx, split, edits);
        }
    }
}

/// 对任意表达式区间内的 JSX 递归切块；节点本身是 JSX 时直接整体变换。
pub(crate) fn transform_region(node: Node<'_>, ctx: &mut Ctx<'_>, split: bool) -> String {
    let mut edits = Vec::new();
    if is_jsx(node) {
        edits.push(Edit {
            start: node.start_byte(),
            end: node.end_byte(),
            replacement: transform_jsx(node, ctx, split),
        });
    } else {
        collect_jsx_edits(node, ctx, split, &mut edits);
    }
    region(node, ctx.source, edits)
}

pub(crate) fn group_key_attr(ctx: &Ctx<'_>) -> String {
    if ctx.coarse {
        format!(" groupKey=\"{}\"", ctx.group)
    } else {
        String::new()
    }
}

/// 切一个 JSX 元素：返回该元素的替换文本（可能提升为 TextBinding / Block / MemoBlock）。
pub(crate) fn transform_jsx(node: Node<'_>, ctx: &mut Ctx<'_>, split: bool) -> String {
    let source = ctx.source;
    let open = open_tag_of(node);
    let close = node.child_by_field_name("close_tag");

    let mut open_edits: Vec<Edit> = Vec::new();
    let mut memo_deps: Option<String> = None;
    let mut force_block = false;
    let mut has_dynamic_attr = false;
    let mut block_marker = false;

    if let Some(open) = open {
        if tag_name(open, source) == Some("Block") {
            block_marker = true;
        }
        for index in 0..open.named_child_count() {
            let Some(attr) = open.named_child(index) else {
                continue;
            };
            if attr.kind() != "jsx_attribute" {
                continue;
            }
            let name = attribute_name(attr, source);
            if name == "v-memo" {
                let is_array = attr
                    .named_child(1)
                    .and_then(|value| value.named_child(0))
                    .is_some_and(|inner| inner.kind() == "array");
                if is_array {
                    memo_deps = attribute_value(attr, source).map(|(_, value)| value.to_string());
                } else {
                    warn(
                        ctx,
                        attr,
                        "[reactivue] v-memo 的值必须是数组字面量；该块降级为普通 Block。",
                    );
                    force_block = true;
                    ctx.used.block = true;
                }
                open_edits.push(Edit {
                    start: leading_ws_start(source, attr.start_byte()),
                    end: attr.end_byte(),
                    replacement: String::new(),
                });
            } else if !is_ignored_attr(name)
                && attr
                    .named_child(1)
                    .is_some_and(|value| value.kind() == "jsx_expression")
            {
                has_dynamic_attr = true;
            }
        }
    }

    let children_start = open.map_or(node.start_byte(), |tag| tag.end_byte());
    let children_end = close.map_or(node.end_byte(), |tag| tag.start_byte());
    let mut children_edits: Vec<Edit> = Vec::new();

    for index in 0..node.named_child_count() {
        let Some(child) = node.named_child(index) else {
            continue;
        };
        if child.start_byte() < children_start || child.end_byte() > children_end {
            continue;
        }
        match child.kind() {
            "jsx_opening_element" | "jsx_closing_element" | "jsx_text" => {}
            "jsx_expression" => {
                let Some(expr) = child.named_child(0) else {
                    continue;
                };
                if expr.kind() == "comment" {
                    continue;
                }
                if !split {
                    let rewritten = transform_region(expr, ctx, false);
                    if rewritten != text(source, expr) {
                        children_edits.push(Edit {
                            start: child.start_byte(),
                            end: child.end_byte(),
                            replacement: format!("{{{rewritten}}}"),
                        });
                    }
                    continue;
                }
                if is_jsx(expr) {
                    children_edits.push(Edit {
                        start: child.start_byte(),
                        end: child.end_byte(),
                        replacement: transform_jsx(expr, ctx, true),
                    });
                    continue;
                }
                let rewritten = transform_region(expr, ctx, true);
                if is_text_expr(expr) {
                    ctx.used.text = true;
                    children_edits.push(Edit {
                        start: child.start_byte(),
                        end: child.end_byte(),
                        replacement: format!(
                            "<{} value={{() => ({rewritten})}} />",
                            ctx.names.text
                        ),
                    });
                } else {
                    ctx.used.block = true;
                    children_edits.push(Edit {
                        start: child.start_byte(),
                        end: child.end_byte(),
                        replacement: format!(
                            "<{} render={{() => ({rewritten})}}{} />",
                            ctx.names.block,
                            group_key_attr(ctx)
                        ),
                    });
                }
            }
            _ if is_jsx(child) => children_edits.push(Edit {
                start: child.start_byte(),
                end: child.end_byte(),
                replacement: transform_jsx(child, ctx, split),
            }),
            _ => {
                let rewritten = transform_region(child, ctx, split);
                if rewritten != text(source, child) {
                    children_edits.push(Edit {
                        start: child.start_byte(),
                        end: child.end_byte(),
                        replacement: rewritten,
                    });
                }
            }
        }
    }

    let open_text = open
        .map(|tag| region(tag, source, open_edits))
        .unwrap_or_default();
    let children_text = apply_edits(
        &source[children_start..children_end],
        children_start,
        children_edits,
    );
    let close_text = close.map(|tag| text(source, tag)).unwrap_or("");
    let base = format!("{open_text}{children_text}{close_text}");

    if block_marker {
        ctx.used.block = true;
        return format!(
            "<{} render={{() => (<>{children_text}</>)}}{} />",
            ctx.names.block,
            group_key_attr(ctx)
        );
    }
    if let Some(deps) = memo_deps {
        ctx.used.memo = true;
        return format!(
            "<{} deps={{() => ({deps})}} render={{() => ({base})}}{} />",
            ctx.names.memo,
            group_key_attr(ctx)
        );
    }
    if split && (has_dynamic_attr || force_block) {
        ctx.used.block = true;
        return format!(
            "<{} render={{() => ({base})}}{} />",
            ctx.names.block,
            group_key_attr(ctx)
        );
    }
    base
}
