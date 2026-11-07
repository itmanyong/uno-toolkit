// 重写引擎：先压缩成单行，再按规则顺序依次匹配与改写，最后一条规则的结果即输出。

use regex::Regex;

use super::declarations::{declared_names, remove_declarations};
use super::minify::minify_css;
use super::rules::find_block_end;
use super::selector::is_selector_occurrence;

pub struct RewriteRule {
    pub match_reg: Vec<String>,
    pub rewrite: String,
    pub rewrite_type: String,
}

struct Edit {
    start: usize,
    end: usize,
    replacement: String,
}

pub fn rewrite_css(code: &str, rules: &[RewriteRule]) -> String {
    if code.trim().is_empty() || rules.is_empty() {
        return code.to_owned();
    }

    let minified = minify_css(code);
    if minified.is_empty() {
        return code.to_owned();
    }

    let mut working = minified.clone();
    for rule in rules {
        working = apply_rule(&working, rule);
    }

    // 没有任何规则真正改动内容时返回原始代码，避免只为压缩就破坏未命中的文件。
    if working == minified {
        code.to_owned()
    } else {
        working
    }
}

fn apply_rule(code: &str, rule: &RewriteRule) -> String {
    let rewrite = minify_css(&rule.rewrite);
    let append = rule.rewrite_type.eq_ignore_ascii_case("append");
    let mut working = code.to_owned();

    for pattern in rule.match_reg.iter().filter(|pattern| !pattern.is_empty()) {
        working = apply_pattern(&working, pattern, &rewrite, append);
    }

    working
}

fn apply_pattern(code: &str, pattern: &str, rewrite: &str, append: bool) -> String {
    let mut edits: Vec<Edit> = Vec::new();
    // 已接受编辑覆盖到的结束位置；后续命中若落在其中说明被选择器块吞掉，直接跳过。
    let mut covered = 0usize;
    let (occurrences, literal) = find_occurrences(code, pattern);

    for (start, end) in occurrences {
        if start < covered {
            continue;
        }
        // 字面量命中不允许落在更长的标识符或选择器片段中间，避免把 `.btn` 改坏 `.btn-link`。
        if literal && !is_token_isolated(code, pattern, start, end) {
            continue;
        }

        let (edit_start, edit_end, replacement) = if is_selector_occurrence(code, start, end) {
            let Some(close) = find_block_end(code, end) else {
                continue;
            };
            let selector = &code[start..end];
            let body = &code[end + 1..close];
            let next_body = if append {
                append_to_block(body, rewrite)
            } else {
                rewrite.to_owned()
            };
            (start, close + 1, format!("{selector}{{{next_body}}}"))
        } else if append {
            (start, end, format!("{}{rewrite}", &code[start..end]))
        } else {
            (start, end, rewrite.to_owned())
        };

        covered = edit_end;
        if replacement == code[edit_start..edit_end] {
            continue;
        }
        edits.push(Edit {
            start: edit_start,
            end: edit_end,
            replacement,
        });
    }

    if edits.is_empty() {
        return code.to_owned();
    }

    let mut result = code.to_owned();
    for edit in edits.into_iter().rev() {
        result.replace_range(edit.start..edit.end, &edit.replacement);
    }
    result
}

/// 先按字面量查找；找不到时才把模式当作正则，这样选择器与普通文本也能直接书写。
fn find_occurrences(code: &str, pattern: &str) -> (Vec<(usize, usize)>, bool) {
    let mut occurrences = Vec::new();
    let mut cursor = 0usize;

    while cursor <= code.len() {
        let Some(offset) = code[cursor..].find(pattern) else {
            break;
        };
        let start = cursor + offset;
        let end = start + pattern.len();
        occurrences.push((start, end));
        cursor = end;
    }

    if !occurrences.is_empty() {
        return (occurrences, true);
    }

    let Ok(regex) = Regex::new(pattern) else {
        return (occurrences, false);
    };

    let occurrences = regex
        .find_iter(code)
        .filter(|matched| matched.start() != matched.end())
        .map(|matched| (matched.start(), matched.end()))
        .collect();

    (occurrences, false)
}

fn is_token_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_' || character == '-' || !character.is_ascii()
}

fn is_token_isolated(code: &str, pattern: &str, start: usize, end: usize) -> bool {
    let before = match (pattern.chars().next(), code[..start].chars().next_back()) {
        (Some(first), Some(previous)) => {
            !(is_token_character(first) && is_token_character(previous))
        }
        _ => true,
    };
    let after = match (pattern.chars().next_back(), code[end..].chars().next()) {
        (Some(last), Some(next)) => !(is_token_character(last) && is_token_character(next)),
        _ => true,
    };
    before && after
}

/// 向选择器内追加样式：先移除同名旧声明，再把 rewrite 追加到声明块末尾。
fn append_to_block(body: &str, rewrite: &str) -> String {
    let names = declared_names(rewrite);
    let remaining = remove_declarations(body, &names).unwrap_or_else(|| body.to_owned());
    append_declarations(&remaining, rewrite)
}

fn append_declarations(body: &str, declarations: &str) -> String {
    if declarations.is_empty() {
        return body.to_owned();
    }
    if body.is_empty() {
        return declarations.to_owned();
    }
    if body.ends_with(';') {
        format!("{body}{declarations}")
    } else {
        format!("{body};{declarations}")
    }
}
