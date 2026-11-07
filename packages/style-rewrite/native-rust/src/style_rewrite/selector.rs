// 选择器识别：命中的文本必须自身构成完整选择器，并且紧跟声明块，才按选择器处理。

fn is_boundary_before(code: &str, start: usize) -> bool {
    match start.checked_sub(1).map(|index| code.as_bytes()[index]) {
        None => true,
        Some(previous) => {
            previous.is_ascii_whitespace() || matches!(previous, b'}' | b'{' | b';' | b',')
        }
    }
}

fn is_selector_start(character: char) -> bool {
    character.is_alphabetic()
        || character == '_'
        || character == '-'
        || matches!(character, '.' | '#' | '*' | '[' | ':' | '\\' | '&')
}

pub(crate) fn is_selector_occurrence(code: &str, start: usize, end: usize) -> bool {
    code.as_bytes().get(end) == Some(&b'{')
        && is_boundary_before(code, start)
        && is_selector_text(&code[start..end])
}

/// 校验一段文本是否是合法的选择器：拒绝声明片段（`color:red`）与 at-rule，
/// 同时校验括号、属性选择器与字符串的配对情况。
pub(crate) fn is_selector_text(text: &str) -> bool {
    let mut characters = text.chars().peekable();
    let Some(first) = characters.peek().copied() else {
        return false;
    };
    if !is_selector_start(first) {
        return false;
    }

    let mut parentheses = 0usize;
    let mut brackets = 0usize;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut last_significant = first;

    for character in characters {
        if escaped {
            escaped = false;
            if !character.is_whitespace() {
                last_significant = character;
            }
            continue;
        }

        if let Some(quote_character) = quote {
            if character == '\\' {
                escaped = true;
            } else if character == quote_character {
                quote = None;
            }
            continue;
        }

        match character {
            '\'' | '"' => quote = Some(character),
            '\\' => escaped = true,
            '(' => parentheses += 1,
            ')' => {
                if parentheses == 0 {
                    return false;
                }
                parentheses -= 1;
            }
            '[' => brackets += 1,
            ']' => {
                if brackets == 0 {
                    return false;
                }
                brackets -= 1;
            }
            '{' | '}' | ';' | '!' | '@' => return false,
            '=' if brackets == 0 => return false,
            _ => {}
        }

        if !character.is_whitespace() {
            last_significant = character;
        }
    }

    if quote.is_some() || escaped || parentheses != 0 || brackets != 0 {
        return false;
    }

    !matches!(last_significant, '>' | '+' | '~' | ',' | ':')
}
