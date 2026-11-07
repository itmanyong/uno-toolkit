// CSS 压缩：去掉注释与多余空白，输出严格单行，供匹配与写回统一使用。

fn is_identifier_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_' || character == '-' || !character.is_ascii()
}

/// 常规空白是否需要保留：相邻标点两侧的空白对 CSS 语义无影响，可直接丢弃。
fn should_drop_space(previous: Option<char>, next: char) -> bool {
    match previous {
        None => true,
        // 冒号之后的空白对选择器与声明都没有意义；冒号之前的空白必须保留，
        // 因为 `a :hover` 与 `a:hover` 是两条不同的选择器。
        Some(previous) => {
            matches!(previous, '{' | '}' | ';' | ',' | '(' | ':')
                || matches!(next, '{' | '}' | ';' | ',' | ')')
        }
    }
}

/// 注释被移除后，只有当两侧都可能构成标识符的一部分时才补一个空格，
/// 避免把 `screen/**/and` 拼成 `screenand`，同时不破坏 `.a/**/.b`。
fn should_keep_comment_space(previous: Option<char>, next: char) -> bool {
    previous.is_some_and(is_identifier_character) && is_identifier_character(next)
}

pub fn minify_css(code: &str) -> String {
    let characters: Vec<char> = code.chars().collect();
    let mut output = String::with_capacity(code.len());
    let mut index = 0;
    let mut pending_space = false;
    let mut space_from_comment = false;
    let mut quote: Option<char> = None;
    let mut escaped = false;

    while index < characters.len() {
        let current = characters[index];

        if let Some(quote_character) = quote {
            output.push(current);
            if escaped {
                escaped = false;
            } else if current == '\\' {
                escaped = true;
            } else if current == quote_character {
                quote = None;
            }
            index += 1;
            continue;
        }

        if current == '/' && characters.get(index + 1) == Some(&'*') {
            index += 2;
            while index < characters.len() {
                if characters[index] == '*' && characters.get(index + 1) == Some(&'/') {
                    index += 2;
                    break;
                }
                index += 1;
            }
            pending_space = true;
            space_from_comment = true;
            continue;
        }

        if current.is_whitespace() {
            pending_space = true;
            space_from_comment = false;
            index += 1;
            continue;
        }

        if pending_space {
            let previous = output.chars().next_back();
            let keep = if space_from_comment {
                should_keep_comment_space(previous, current)
            } else {
                !should_drop_space(previous, current)
            };
            if keep {
                output.push(' ');
            }
            pending_space = false;
            space_from_comment = false;
        }

        // 声明块末尾的分号对 CSS 语义没有影响，压缩时一并去掉。
        if current == '}' && output.ends_with(';') {
            output.pop();
        }

        if current == '\'' || current == '"' {
            quote = Some(current);
        }
        output.push(current);
        index += 1;
    }

    output.trim().to_owned()
}
