// 通用无状态工具：标识符、字面量判定、区间编辑合并、快速路径探测。

use crate::jsx_directive::types::Edit;

pub(crate) fn fresh_parameter(source: &str, base: &str) -> String {
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

pub(crate) fn jsx_can_start(before: &str) -> bool {
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

pub(crate) fn looks_like_generic(source: &str, start: usize) -> bool {
    let Some(relative_end) = source[start..].find('>') else {
        return false;
    };
    let end = start + relative_end;
    source[start + 1..end].contains(',') && source[end + 1..].trim_start().starts_with('(')
}

pub(crate) fn has_directive_candidate(source: &str, prefix: &str) -> bool {
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

pub(crate) fn regex_can_start(before: &str) -> bool {
    let before = before.trim_end();
    before.is_empty()
        || before.ends_with(['=', '(', '[', '{', ',', ':', ';', '!', '?', '&', '|'])
        || ["return", "throw", "case", "yield"]
            .iter()
            .any(|word| before.ends_with(word))
}

pub(crate) fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars
        .next()
        .is_some_and(|ch| ch.is_alphabetic() || ch == '_' || ch == '$')
        && chars.all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '$')
}

pub(crate) fn apply_edits(source: &str, start: usize, end: usize, mut edits: Vec<Edit>) -> String {
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