pub fn transform_style_layer(
    code: String,
    layer_name: String,
    skip_if_layer_exists: bool,
    import_layer: bool,
) -> String {
    if code.trim().is_empty() {
        return code;
    }

    if skip_if_layer_exists && has_layer_rule(&code) {
        return code;
    }

    let (preamble, charset, imports, namespaces, body) = extract_leading_rules(&code);
    let imports = if import_layer {
        imports
            .into_iter()
            .map(|rule| add_layer_to_import(&rule, &layer_name))
            .collect::<Vec<_>>()
    } else {
        imports
    };

    let mut parts = Vec::new();
    if !preamble.trim().is_empty() {
        parts.push(preamble.trim().to_owned());
    }
    if let Some(charset) = charset {
        parts.push(charset);
    }
    if !imports.is_empty() {
        parts.push(imports.join("\n"));
    }
    if !namespaces.is_empty() {
        parts.push(namespaces.join("\n"));
    }
    if !body.trim().is_empty() {
        parts.push(format!("@layer {layer_name} {{\n{}\n}}", body.trim()));
    }

    parts.join("\n\n")
}

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

fn extract_leading_rules(code: &str) -> (String, Option<String>, Vec<String>, Vec<String>, String) {
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

fn find_import_rules(code: &str) -> Vec<(usize, usize, String)> {
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

fn has_layer_rule(code: &str) -> bool {
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

fn add_layer_to_import(rule: &str, layer_name: &str) -> String {
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

fn import_target(rule: &str) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::{style_layer_import_targets, transform_style_layer, transform_style_layer_imports};

    #[test]
    fn 将样式包裹在命名层中() {
        let result = transform_style_layer(
            ".button { color: red; }".to_owned(),
            "components".to_owned(),
            true,
            true,
        );

        assert_eq!(result, "@layer components {\n.button { color: red; }\n}");
    }

    #[test]
    fn 保留前置规则并为导入添加层() {
        let result = transform_style_layer(
            "@charset \"UTF-8\";\n@import \"theme.css\" screen;\n@namespace svg url(http://www.w3.org/2000/svg);\n.button { color: red; }".to_owned(),
            "vendor".to_owned(),
            true,
            true,
        );

        assert_eq!(
            result,
            "@charset \"UTF-8\";\n\n@import \"theme.css\" layer(vendor) screen;\n\n@namespace svg url(http://www.w3.org/2000/svg);\n\n@layer vendor {\n.button { color: red; }\n}"
        );
    }

    #[test]
    fn 配置跳过已有层() {
        let code = "@layer base { body { margin: 0; } }".to_owned();
        assert_eq!(
            transform_style_layer(code.clone(), "vendor".to_owned(), true, true),
            code
        );
    }

    #[test]
    fn 忽略注释和字符串中的层声明() {
        let code = "/* @layer fake */\n.content::before { content: \"@layer fake\"; }".to_owned();
        let result = transform_style_layer(code, "components".to_owned(), true, true);

        assert!(result.starts_with("@layer components {"));
    }

    #[test]
    fn 保留已有层声明的导入() {
        let result = transform_style_layer(
            "@import url(\"theme.css\") layer(theme) screen;\nbody { color: black; }".to_owned(),
            "vendor".to_owned(),
            true,
            true,
        );

        assert!(result.contains("@import url(\"theme.css\") layer(theme) screen;"));
        assert!(!result.contains("layer(theme) layer(vendor)"));
    }

    #[test]
    fn 保留样式文件开头的注释() {
        let result = transform_style_layer(
            "/* license */\n@import \"theme.css\";\nbody { color: black; }".to_owned(),
            "vendor".to_owned(),
            true,
            true,
        );

        assert!(result.starts_with("/* license */\n\n@import \"theme.css\" layer(vendor);"));
    }

    #[test]
    fn 可选择不为导入添加层() {
        let result = transform_style_layer(
            "@import \"theme.css\";\nbody { color: black; }".to_owned(),
            "vendor".to_owned(),
            true,
            false,
        );

        assert!(result.starts_with("@import \"theme.css\";"));
        assert!(result.contains("@layer vendor {"));
    }

    #[test]
    fn 仅为匹配的样式导入添加层() {
        let code = "@layer base, utilities;\n@import \"tailwindcss\";\n@import \"@radix-ui/themes/components.css\";\nbody { color: black; }".to_owned();
        let result = transform_style_layer_imports(
            code,
            vec![(
                "@radix-ui/themes/components.css".to_owned(),
                "radix-ui".to_owned(),
            )],
        );

        assert!(result.contains("@import \"tailwindcss\";"));
        assert!(result.contains("@import \"@radix-ui/themes/components.css\" layer(radix-ui);"));
    }

    #[test]
    fn 识别带注释和函数形式的样式导入() {
        let code = "/* @import \"ignored.css\"; */\n@import url(\"@radix-ui/themes/components.css\") screen;\n.test { content: \"@import 'ignored.css';\"; }".to_owned();
        assert_eq!(
            style_layer_import_targets(&code),
            vec!["@radix-ui/themes/components.css"]
        );
    }
}
