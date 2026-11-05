// JSX 冒号简写预处理：把开标签属性位置的 `:` 原地改成 `$`，保持字节偏移不变。
use crate::jsx_directive::utils::{jsx_can_start, looks_like_generic, regex_can_start};

// 仅替换开标签属性位置的冒号，保持字节长度，以便 AST 偏移继续对应原始源码。
pub(crate) fn normalize_shorthand(
    source: &str,
    output: &mut [u8],
    mut index: usize,
    expression: bool,
) -> usize {
    let bytes = source.as_bytes();
    while index < bytes.len() {
        match bytes[index] {
            b'\'' | b'"' | b'`' => {
                let quote = bytes[index];
                index += 1;
                while index < bytes.len() && bytes[index] != quote {
                    if bytes[index] == b'\\' {
                        index += 2;
                    } else if quote == b'`' && bytes[index..].starts_with(b"${") {
                        index = normalize_shorthand(source, output, index + 2, true);
                    } else {
                        index += 1;
                    }
                }
                index += usize::from(index < bytes.len());
            }
            b'/' if bytes[index..].starts_with(b"//") => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            b'/' if bytes[index..].starts_with(b"/*") => {
                index += 2;
                while index + 1 < bytes.len() && !bytes[index..].starts_with(b"*/") {
                    index += 1;
                }
                index = (index + 2).min(bytes.len());
            }
            b'/' if regex_can_start(&source[..index]) => {
                index += 1;
                let mut character_class = false;
                while index < bytes.len() {
                    match bytes[index] {
                        b'\\' => {
                            index += 2;
                            continue;
                        }
                        b'[' => character_class = true,
                        b']' => character_class = false,
                        b'/' if !character_class => {
                            index += 1;
                            break;
                        }
                        b'\n' => break,
                        _ => {}
                    }
                    index += 1;
                }
            }
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b'}' if expression => return index + 1,
            b'<' if jsx_can_start(&source[..index])
                && !looks_like_generic(source, index)
                && bytes.get(index + 1).is_some_and(|next| {
                    next.is_ascii_alphabetic() || matches!(next, b'_' | b'$' | b'>')
                }) =>
            {
                index = normalize_jsx_tag(source, output, index);
            }
            _ => index += 1,
        }
    }
    index
}

pub(crate) fn normalize_jsx_tag(source: &str, output: &mut [u8], start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut index = start + 1;
    while index < bytes.len()
        && (bytes[index].is_ascii_alphanumeric()
            || bytes[index] >= 128
            || matches!(bytes[index], b'_' | b'$' | b'-' | b'.' | b':'))
    {
        index += 1;
    }
    let tag = &source[start + 1..index];
    while index < bytes.len() {
        match bytes[index] {
            b'\'' | b'"' => {
                let quote = bytes[index];
                index += 1;
                while index < bytes.len() && bytes[index] != quote {
                    index += 1;
                }
                index += usize::from(index < bytes.len());
            }
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b':' if index > start
                && bytes[index - 1].is_ascii_whitespace()
                && bytes.get(index + 1).is_some_and(|next| {
                    next.is_ascii_alphabetic() || *next >= 128 || matches!(next, b'_' | b'$')
                }) =>
            {
                output[index] = b'$';
                index += 1;
            }
            b'>' => {
                let self_closing = bytes[index - 1] == b'/';
                index += 1;
                if self_closing || !source[index..].contains(&format!("</{tag}")) {
                    return index;
                }
                break;
            }
            _ => index += 1,
        }
    }
    while index < bytes.len() {
        if bytes[index..].starts_with(b"</") {
            while index < bytes.len() && bytes[index] != b'>' {
                index += 1;
            }
            return (index + 1).min(bytes.len());
        }
        match bytes[index] {
            b'{' => index = normalize_shorthand(source, output, index + 1, true),
            b'<' if bytes.get(index + 1).is_some_and(|next| {
                next.is_ascii_alphabetic() || matches!(next, b'_' | b'$' | b'>')
            }) =>
            {
                index = normalize_jsx_tag(source, output, index)
            }
            _ => index += 1,
        }
    }
    index
}

