// 导入规则改写：为 @import 追加 layer()、提取导入目标、按映射批量转换 import。

use super::rules::find_import_rules;

pub fn style_layer_import_targets(code: &str) -> Vec<String> {
    find_import_rules(code)
        .into_iter()
        .map(|(_, _, target)| target)
        .collect()
}

pub fn transform_style_layer_imports(code: String, import_layers: Vec<(String, String)>) -> String {
    let rules = find_import_rules(&code);
    let mut edits = Vec::new();

    for (start, end, target) in rules {
        let Some((_, layer_name)) = import_layers.iter().find(|(request, _)| request == &target)
        else {
            continue;
        };
        let rule = &code[start..end];
        let transformed = add_layer_to_import(rule, layer_name);
        if transformed != rule {
            edits.push((start, end, transformed));
        }
    }

    let mut result = code;
    for (start, end, replacement) in edits.into_iter().rev() {
        result.replace_range(start..end, &replacement);
    }
    result
}

pub(crate) fn add_layer_to_import(rule: &str, layer_name: &str) -> String {
    let Some(target_end) = import_target_end(rule) else {
        return rule.to_owned();
    };
    let remainder = rule[target_end..].trim_start();
    if remainder
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("layer"))
        && remainder[5..].chars().next().is_some_and(|character| {
            character == '(' || character.is_whitespace() || character == ';'
        })
    {
        return rule.to_owned();
    }
    format!(
        "{} layer({}){}",
        rule[..target_end].trim_end(),
        layer_name,
        &rule[target_end..]
    )
}

pub(crate) fn import_target(rule: &str) -> Option<String> {
    let target_end = import_target_end(rule)?;
    let target = rule[7..target_end].trim();
    if target
        .get(..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("url("))
    {
        let target = target.get(4..target.len().checked_sub(1)?)?.trim();
        let target = target
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                target
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(target);
        return Some(target.to_owned());
    }

    Some(target.trim_matches('"').trim_matches('\'').to_owned())
}

fn import_target_end(rule: &str) -> Option<usize> {
    let bytes = rule.as_bytes();
    let mut cursor = 7; // "@import".len()
    while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
        cursor += 1;
    }

    match bytes.get(cursor).copied()? {
        b'\'' | b'"' => {
            let quote = bytes[cursor];
            cursor += 1;
            let mut escaped = false;
            while cursor < bytes.len() {
                let current = bytes[cursor];
                if escaped {
                    escaped = false;
                } else if current == b'\\' {
                    escaped = true;
                } else if current == quote {
                    return Some(cursor + 1);
                }
                cursor += 1;
            }
            None
        }
        _ => {
            if rule[cursor..]
                .get(..4)
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("url("))
            {
                let mut depth = 0usize;
                let mut quote = None;
                let mut escaped = false;
                while cursor < bytes.len() {
                    let current = bytes[cursor];
                    if let Some(quote_char) = quote {
                        if escaped {
                            escaped = false;
                        } else if current == b'\\' {
                            escaped = true;
                        } else if current == quote_char {
                            quote = None;
                        }
                    } else if current == b'\'' || current == b'"' {
                        quote = Some(current);
                    } else if current == b'(' {
                        depth += 1;
                    } else if current == b')' {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            return Some(cursor + 1);
                        }
                    }
                    cursor += 1;
                }
                None
            } else {
                rule[cursor..]
                    .find(|character: char| character.is_whitespace() || character == ';')
                    .map(|offset| cursor + offset)
            }
        }
    }
}
