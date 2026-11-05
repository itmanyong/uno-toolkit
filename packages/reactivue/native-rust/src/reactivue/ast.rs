//! tree-sitter 查询辅助：JSX 判定、属性解析、节点定位与递归收集。

use tree_sitter::Node;

use super::types::RenderKind;
use super::utils::text;

pub(crate) fn is_jsx(node: Node<'_>) -> bool {
    matches!(node.kind(), "jsx_element" | "jsx_self_closing_element")
}

pub(crate) fn is_ignored_attr(name: &str) -> bool {
    name == "key"
        || name == "ref"
        || (name.starts_with("on")
            && name.as_bytes().get(2).is_some_and(u8::is_ascii_uppercase))
}

/// 文本通道启用条件（§6.2 保守白名单）：出现任何 JSX / 函数 / 对象 / 数组一律降级。
pub(crate) fn is_text_expr(node: Node<'_>) -> bool {
    match node.kind() {
        "jsx_element"
        | "jsx_self_closing_element"
        | "jsx_fragment"
        | "arrow_function"
        | "function_expression"
        | "object"
        | "array"
        | "new_expression"
        | "await_expression"
        | "assignment_expression"
        | "sequence_expression"
        | "comment" => false,
        _ => (0..node.named_child_count())
            .all(|index| node.named_child(index).is_none_or(is_text_expr)),
    }
}

pub(crate) fn open_tag_of(node: Node<'_>) -> Option<Node<'_>> {
    if node.kind() == "jsx_self_closing_element" {
        return Some(node);
    }
    node.child_by_field_name("open_tag")
}

pub(crate) fn tag_name<'a>(open: Node<'_>, source: &'a str) -> Option<&'a str> {
    open.child_by_field_name("name")
        .map(|name| text(source, name))
}

pub(crate) fn attribute_name<'a>(attr: Node<'_>, source: &'a str) -> &'a str {
    attr.named_child(0)
        .map(|name| text(source, name))
        .unwrap_or("")
}

/// jsx_attribute 的值：jsx_expression 取其内部表达式文本，其余取原文本。
pub(crate) fn attribute_value<'a>(attr: Node<'a>, source: &'a str) -> Option<(Node<'a>, &'a str)> {
    let value = attr.named_child(1)?;
    if value.kind() == "jsx_expression" {
        let inner = value.named_child(0)?;
        Some((value, text(source, inner)))
    } else {
        Some((value, text(source, value)))
    }
}

pub(crate) fn leading_ws_start(source: &str, start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut cursor = start;
    while cursor > 0 && bytes[cursor - 1].is_ascii_whitespace() {
        cursor -= 1;
    }
    cursor
}

pub(crate) fn unwrap_parens(node: Node<'_>) -> Node<'_> {
    if node.kind() == "parenthesized_expression" {
        if let Some(inner) = node.named_child(0) {
            return inner;
        }
    }
    node
}

/// 从 setup 函数体定位需要切块的 JSX 节点。
pub(crate) fn find_render_jsx<'a>(setup: Node<'a>, source: &str) -> Option<(Node<'a>, RenderKind)> {
    let body = setup.child_by_field_name("body")?;
    if is_jsx(body) {
        return Some((body, RenderKind::ArrowExpression));
    }
    let body = unwrap_parens(body);
    if body.kind() == "object" {
        for index in 0..body.named_child_count() {
            let Some(pair) = body.named_child(index) else {
                continue;
            };
            if pair.kind() != "pair" {
                continue;
            }
            let key = pair
                .child_by_field_name("key")
                .map(|node| text(source, node))
                .unwrap_or("");
            if key != "render" {
                continue;
            }
            let value = pair.child_by_field_name("value")?;
            let inner = match value.kind() {
                "arrow_function" => value.child_by_field_name("body")?,
                _ => value,
            };
            if is_jsx(unwrap_parens(inner)) {
                return Some((unwrap_parens(inner), RenderKind::Ready));
            }
        }
        return None;
    }
    if body.kind() == "arrow_function" {
        let inner = body.child_by_field_name("body")?;
        if is_jsx(unwrap_parens(inner)) {
            return Some((unwrap_parens(inner), RenderKind::Ready));
        }
        return None;
    }
    if body.kind() != "statement_block" {
        return None;
    }
    for index in (0..body.named_child_count()).rev() {
        let statement = body.named_child(index)?;
        if statement.kind() != "return_statement" {
            continue;
        }
        let Some(value) = statement.named_child(0) else {
            return None;
        };
        let value = unwrap_parens(value);
        if is_jsx(value) {
            return Some((value, RenderKind::Direct));
        }
        if value.kind() == "arrow_function" {
            let inner = value.child_by_field_name("body")?;
            if is_jsx(unwrap_parens(inner)) {
                return Some((unwrap_parens(inner), RenderKind::Ready));
            }
        }
        return None;
    }
    None
}

pub(crate) fn collect_calls<'a>(node: Node<'a>, source: &str, out: &mut Vec<Node<'a>>) {
    if node.kind() == "call_expression"
        && node
            .child_by_field_name("function")
            .is_some_and(|function| text(source, function) == "defineComponent")
    {
        out.push(node);
    }
    for index in 0..node.named_child_count() {
        if let Some(child) = node.named_child(index) {
            collect_calls(child, source, out);
        }
    }
}

pub(crate) fn collect_memo_attrs<'a>(node: Node<'a>, source: &str, out: &mut Vec<Node<'a>>) {
    if node.kind() == "jsx_attribute" && attribute_name(node, source) == "v-memo" {
        out.push(node);
    }
    for index in 0..node.named_child_count() {
        if let Some(child) = node.named_child(index) {
            collect_memo_attrs(child, source, out);
        }
    }
}

/// 收集从 react / react-dom 导入的 use* 标识符（本地绑定名）。
/// VueUse 等经 vue alias 导入的 use* 组合式函数不在此列，不会误判为 React hooks。
pub(crate) fn collect_react_hooks(root: Node<'_>, source: &str) -> std::collections::HashSet<String> {
    let mut hooks = std::collections::HashSet::new();
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        if child.kind() != "import_statement" {
            continue;
        }
        let Some(module) = child.child_by_field_name("source") else {
            continue;
        };
        let raw = text(source, module);
        let module_name = raw.trim_matches(|ch| ch == '\'' || ch == '"');
        if module_name != "react" && module_name != "react-dom" {
            continue;
        }
        // import_clause / named_imports 均无字段名，按 named_children 层级取。
        let mut outer = child.walk();
        for clause in child.named_children(&mut outer) {
            if clause.kind() != "import_clause" {
                continue;
            }
            let mut middle = clause.walk();
            for named in clause.named_children(&mut middle) {
                if named.kind() != "named_imports" {
                    continue;
                }
                let mut inner = named.walk();
                for specifier in named.named_children(&mut inner) {
                    if specifier.kind() != "import_specifier" {
                        continue;
                    }
                    // `import { use as x }` 的本地名是 alias（第二个 identifier）。
                    let mut specs = specifier.walk();
                    let identifiers: Vec<_> = specifier
                        .named_children(&mut specs)
                        .filter(|item| item.kind() == "identifier")
                        .collect();
                    let Some(local) = identifiers.iter().nth(1).or(identifiers.first()) else {
                        continue;
                    };
                    let name = text(source, *local);
                    if name.starts_with("use")
                        && name.as_bytes().get(3).is_some_and(u8::is_ascii_uppercase)
                    {
                        hooks.insert(name.to_string());
                    }
                }
            }
        }
    }
    hooks
}

/// setup 内调用了从 react 导入的 hooks 时跳过切块（hooks 依赖固定渲染顺序）。
pub(crate) fn contains_hooks(node: Node<'_>, source: &str, hooks: &std::collections::HashSet<String>) -> bool {
    if node.kind() == "call_expression" {
        if let Some(function) = node.child_by_field_name("function") {
            let name = text(source, function);
            if hooks.contains(name) {
                return true;
            }
        }
    }
    (0..node.named_child_count()).any(|index| {
        node.named_child(index)
            .is_some_and(|child| contains_hooks(child, source, hooks))
    })
}

pub(crate) fn owner_element(attr: Node<'_>) -> Option<Node<'_>> {
    let open = attr.parent()?;
    let element = open.parent()?;
    is_jsx(element).then_some(element)
}
