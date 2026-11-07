// 声明解析：把声明块拆成声明与不可解析片段，并为「追加去重」提供属性名归一化与同名判定。

use super::rules::find_block_end;

pub(crate) enum Item {
    Declaration { name: String, text: String },
    Opaque(String),
}

impl Item {
    pub(crate) fn text(&self) -> &str {
        match self {
            Item::Declaration { text, .. } => text,
            Item::Opaque(text) => text,
        }
    }
}

/// 拆分声明块：嵌套规则与无法解析为 `属性名: 值` 的片段都原样保留为 Opaque。
pub(crate) fn parse_items(body: &str) -> Vec<Item> {
    let bytes = body.as_bytes();
    let mut items = Vec::new();
    let mut index = 0usize;

    while index < bytes.len() {
        while index < bytes.len() && bytes[index] == b';' {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }

        let start = index;
        let mut parenthesis = 0usize;
        let mut quote: Option<u8> = None;
        let mut escaped = false;
        let mut block_open: Option<usize> = None;

        while index < bytes.len() {
            let current = bytes[index];

            if escaped {
                escaped = false;
                index += 1;
                continue;
            }

            if let Some(quote_character) = quote {
                if current == b'\\' {
                    escaped = true;
                } else if current == quote_character {
                    quote = None;
                }
                index += 1;
                continue;
            }

            match current {
                b'\'' | b'"' => quote = Some(current),
                b'(' | b'[' => parenthesis += 1,
                b')' | b']' => parenthesis = parenthesis.saturating_sub(1),
                b'{' if parenthesis == 0 => {
                    block_open = Some(index);
                    break;
                }
                b';' if parenthesis == 0 => break,
                _ => {}
            }

            index += 1;
        }

        if let Some(open) = block_open {
            let close = find_block_end(body, open).unwrap_or(bytes.len() - 1);
            items.push(Item::Opaque(body[start..=close].to_owned()));
            index = close + 1;
            continue;
        }

        let text = body[start..index].trim();
        if !text.is_empty() {
            items.push(match declaration_name(text) {
                Some(name) => Item::Declaration {
                    name,
                    text: text.to_owned(),
                },
                None => Item::Opaque(text.to_owned()),
            });
        }

        if index < bytes.len() && bytes[index] == b';' {
            index += 1;
        }
    }

    items
}

/// 取出一条声明里的属性名；取不到（嵌套规则、值片段、at-rule 等）时返回 None。
fn declaration_name(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut parenthesis = 0usize;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    let mut index = 0usize;

    while index < bytes.len() {
        let current = bytes[index];

        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if let Some(quote_character) = quote {
            if current == b'\\' {
                escaped = true;
            } else if current == quote_character {
                quote = None;
            }
            index += 1;
            continue;
        }

        match current {
            b'\'' | b'"' => quote = Some(current),
            b'(' | b'[' => parenthesis += 1,
            b')' | b']' => parenthesis = parenthesis.saturating_sub(1),
            b'{' | b'}' | b';' => return None,
            b':' if parenthesis == 0 => {
                let name = text[..index].trim();
                if !is_property_name(name) {
                    return None;
                }
                return Some(normalize_property_name(name));
            }
            _ => {}
        }

        index += 1;
    }

    None
}

fn is_property_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '\\')
        })
}

/// 标准属性名大小写不敏感；自定义属性 `--x` 按规范区分大小写。
fn normalize_property_name(name: &str) -> String {
    if name.starts_with("--") {
        name.to_owned()
    } else {
        name.to_ascii_lowercase()
    }
}

pub(crate) fn declared_names(css: &str) -> Vec<String> {
    parse_items(css)
        .into_iter()
        .filter_map(|item| match item {
            Item::Declaration { name, .. } => Some(name),
            Item::Opaque(_) => None,
        })
        .collect()
}

/// 移除与给定属性名同名的声明；一个都没移除时返回 None，便于调用方保留原始声明块。
pub(crate) fn remove_declarations(body: &str, names: &[String]) -> Option<String> {
    if names.is_empty() {
        return None;
    }

    let items = parse_items(body);
    let kept: Vec<&Item> = items
        .iter()
        .filter(|item| match item {
            Item::Declaration { name, .. } => !names.iter().any(|target| target == name),
            Item::Opaque(_) => true,
        })
        .collect();

    if kept.len() == items.len() {
        return None;
    }

    Some(
        kept.iter()
            .map(|item| item.text())
            .collect::<Vec<_>>()
            .join(";"),
    )
}
