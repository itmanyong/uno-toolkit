// at-rule 解析：跳过空白与注释、提取前置规则、定位 @import、检测已有 @layer。

use super::imports::import_target;

pub(crate) fn extract_leading_rules(code: &str) -> (String, Option<String>, Vec<String>, Vec<String>, String) {
    let mut cursor = 0;
    let mut preamble = String::new();
    let mut charset = None;
    let mut imports = Vec::new();
    let mut namespaces = Vec::new();

    loop {
        let rule_start = skip_whitespace_and_comments(code, cursor);
        let Some((rule_name, end)) = read_at_rule(code, rule_start) else {
            break;
        };
        preamble.push_str(&code[cursor..rule_start]);
        let rule = code[rule_start..end].trim().to_owned();

        match rule_name.as_str() {
            "charset" => charset = Some(rule),
            "import" => imports.push(rule),
            "namespace" => namespaces.push(rule),
            _ => break,
        }
        cursor = end;
    }

    (
        preamble,
        charset,
        imports,
        namespaces,
        code[cursor..].to_owned(),
    )
}

fn skip_whitespace_and_comments(code: &str, mut cursor: usize) -> usize {
    let bytes = code.as_bytes();
    loop {
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if bytes.get(cursor..cursor + 2) == Some(b"/*") {
            if let Some(end) = code[cursor + 2..].find("*/") {
                cursor += end + 4;
                continue;
            }
        }
        return cursor;
    }
}

fn read_at_rule(code: &str, cursor: usize) -> Option<(String, usize)> {
    let bytes = code.as_bytes();
    if bytes.get(cursor) != Some(&b'@') {
        return None;
    }

    let mut name_end = cursor + 1;
    while name_end < bytes.len()
        && (bytes[name_end].is_ascii_alphanumeric() || bytes[name_end] == b'-')
    {
        name_end += 1;
    }
    let name = code[cursor + 1..name_end].to_ascii_lowercase();
    if !matches!(name.as_str(), "charset" | "import" | "namespace") {
        return None;
    }

    let mut quote = None;
    let mut escaped = false;
    let mut comment = false;
    let mut depth = 0usize;
    let mut index = name_end;
    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if comment {
            if current == b'*' && next == Some(b'/') {
                comment = false;
                index += 2;
                continue;
            }
        } else if let Some(quote_char) = quote {
            if escaped {
                escaped = false;
            } else if current == b'\\' {
                escaped = true;
            } else if current == quote_char {
                quote = None;
            }
        } else if current == b'/' && next == Some(b'*') {
            comment = true;
            index += 2;
            continue;
        } else if current == b'\'' || current == b'"' {
            quote = Some(current);
        } else if current == b'(' {
            depth += 1;
        } else if current == b')' {
            depth = depth.saturating_sub(1);
        } else if current == b';' && depth == 0 {
            return Some((name, index + 1));
        }
        index += 1;
    }
    None
}

pub(crate) fn find_import_rules(code: &str) -> Vec<(usize, usize, String)> {
    let bytes = code.as_bytes();
    let mut rules = Vec::new();
    let mut index = 0;
    let mut quote = None;
    let mut escaped = false;
    let mut comment = false;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if comment {
            if current == b'*' && next == Some(b'/') {
                comment = false;
                index += 2;
                continue;
            }
        } else if let Some(quote_char) = quote {
            if escaped {
                escaped = false;
            } else if current == b'\\' {
                escaped = true;
            } else if current == quote_char {
                quote = None;
            }
        } else if current == b'/' && next == Some(b'*') {
            comment = true;
            index += 2;
            continue;
        } else if current == b'\'' || current == b'"' {
            quote = Some(current);
        } else if bytes
            .get(index..index + 7)
            .is_some_and(|value| value.eq_ignore_ascii_case(b"@import"))
            && (index == 0
                || !(bytes[index - 1].is_ascii_alphanumeric()
                    || bytes[index - 1] == b'_'
                    || bytes[index - 1] == b'-'))
            && bytes.get(index + 7).is_some_and(u8::is_ascii_whitespace)
        {
            if let Some((_, end)) = read_at_rule(code, index) {
                if let Some(target) = import_target(&code[index..end]) {
                    rules.push((index, end, target));
                    index = end;
                    continue;
                }
            }
        }
        index += 1;
    }
    rules
}

pub(crate) fn has_layer_rule(code: &str) -> bool {
    let bytes = code.as_bytes();
    let mut index = 0;
    let mut quote = None;
    let mut escaped = false;
    let mut comment = false;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if comment {
            if current == b'*' && next == Some(b'/') {
                comment = false;
                index += 2;
                continue;
            }
        } else if let Some(quote_char) = quote {
            if escaped {
                escaped = false;
            } else if current == b'\\' {
                escaped = true;
            } else if current == quote_char {
                quote = None;
            }
        } else if current == b'/' && next == Some(b'*') {
            comment = true;
            index += 2;
            continue;
        } else if current == b'\'' || current == b'"' {
            quote = Some(current);
        } else if bytes.get(index..index + 6) == Some(b"@layer") {
            let after_name = index + 6;
            if bytes.get(after_name).is_some_and(u8::is_ascii_whitespace) {
                let mut name_start = after_name;
                while bytes.get(name_start).is_some_and(u8::is_ascii_whitespace) {
                    name_start += 1;
                }
                if bytes.get(name_start).is_some_and(|byte| {
                    byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'-'
                }) {
                    return true;
                }
            }
        }
        index += 1;
    }
    false
}
