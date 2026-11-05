//! 无状态工具函数：格式归一化、文本/编辑操作、诊断记录与 import 插入点定位。

use tree_sitter::Node;

use super::types::{Ctx, Edit, TransformOptions, Warning};

pub(crate) fn normalized_formats(options: &Option<TransformOptions>) -> Vec<String> {
    options
        .as_ref()
        .and_then(|value| value.formats.clone())
        .unwrap_or_else(|| vec!["jsx".to_string(), "tsx".to_string()])
        .iter()
        .map(|format| format.trim_start_matches('.').to_lowercase())
        .collect()
}

pub(crate) fn extension_of(filename: &str) -> String {
    filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase()
}

pub(crate) fn unique_identifier(source: &str, base: &str) -> String {
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

pub(crate) fn text<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

pub(crate) fn apply_edits(source: &str, offset: usize, mut edits: Vec<Edit>) -> String {
    edits.sort_by(|left, right| right.start.cmp(&left.start));
    let mut result = source.to_string();
    for edit in edits {
        let start = edit.start.saturating_sub(offset);
        let end = edit.end.saturating_sub(offset);
        if start > end || end > result.len() {
            continue;
        }
        result.replace_range(start..end, &edit.replacement);
    }
    result
}

pub(crate) fn region(node: Node<'_>, source: &str, edits: Vec<Edit>) -> String {
    apply_edits(text(source, node), node.start_byte(), edits)
}

pub(crate) fn warn(ctx: &mut Ctx<'_>, node: Node<'_>, message: impl Into<String>) {
    let diagnostic = Warning {
        message: message.into(),
        start: node.start_byte() as u32,
        end: node.end_byte() as u32,
    };
    if ctx.strict {
        ctx.errors.push(diagnostic);
    } else {
        ctx.warnings.push(diagnostic);
    }
}

pub(crate) fn import_position(root: Node<'_>, source: &str) -> usize {
    let mut fallback = 0;
    for index in 0..root.named_child_count() {
        let Some(child) = root.named_child(index) else {
            break;
        };
        if child.kind() == "import_statement" {
            return child.start_byte();
        }
        if index == 0 && child.kind() == "expression_statement" {
            let directive = text(source, child);
            if directive.starts_with("'use ") || directive.starts_with("\"use ") {
                fallback = child.end_byte();
            }
        }
        if fallback == 0 {
            break;
        }
    }
    fallback
}

/// 构建「字节偏移 → UTF-16 code unit 偏移」索引。
/// JS 侧（MagicString / 字符串切片）使用 UTF-16 索引，
/// tree-sitter 与 Rust 内部使用字节偏移，输出前必须转换。
pub(crate) struct Utf16Index {
    byte_positions: Vec<usize>,
    utf16_acc: Vec<u32>,
}

impl Utf16Index {
    pub(crate) fn build(code: &str) -> Self {
        let mut byte_positions = Vec::with_capacity(code.len() + 1);
        let mut utf16_acc = Vec::with_capacity(code.len() + 1);
        let mut acc: u32 = 0;
        for (byte_idx, ch) in code.char_indices() {
            byte_positions.push(byte_idx);
            utf16_acc.push(acc);
            acc += ch.len_utf16() as u32;
        }
        byte_positions.push(code.len());
        utf16_acc.push(acc);
        Self {
            byte_positions,
            utf16_acc,
        }
    }

    pub(crate) fn convert(&self, byte_offset: usize) -> u32 {
        match self.byte_positions.binary_search(&byte_offset) {
            Ok(index) => self.utf16_acc[index],
            Err(index) => self.utf16_acc.get(index).copied().unwrap_or_default(),
        }
    }
}
