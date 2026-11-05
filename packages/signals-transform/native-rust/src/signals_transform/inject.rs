// 注入与改写：生成唯一标识符、定位 import 位置、构造 import 语句并应用文本编辑。

use tree_sitter::Node;

use super::types::Edit;

pub(crate) fn unique_identifier(source: &str, base: &str) -> String {
    if !source.contains(base) {
        return base.to_string();
    }
    (2..)
        .map(|index| format!("{base}{index}"))
        .find(|name| !source.contains(name))
        .expect("an unused generated identifier exists")
}

pub(crate) fn import_position(root: Node<'_>, source: &str) -> usize {
    let mut position = 0;
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        if child.kind() == "import_statement" {
            position = child.end_byte();
        }
    }
    if position == 0 && source.starts_with("#!") {
        return source.find('\n').map_or(source.len(), |index| index + 1);
    }
    position
}

pub(crate) fn build_import(source: &str, import_source: &str, identifier: &str) -> String {
    let module_specifier = serde_json::to_string(import_source)
        .expect("serializing a JavaScript module specifier cannot fail");
    let has_es_module_syntax = source.lines().any(|line| {
        line.trim_start().starts_with("import ") || line.trim_start().starts_with("export ")
    });
    let has_commonjs_syntax = source.contains("require(") || source.contains("module.exports");
    if has_es_module_syntax || !has_commonjs_syntax {
        format!("\nimport {{ useSignals as {identifier} }} from {module_specifier};")
    } else {
        format!("\nvar {identifier} = require({module_specifier}).useSignals;")
    }
}

pub(crate) fn apply_edits(source: &str, offset: usize, mut edits: Vec<Edit>) -> String {
    edits.sort_by(|left, right| right.start.cmp(&left.start));
    let mut result = source.to_string();
    for edit in edits {
        let start = edit.start.saturating_sub(offset);
        let end = edit.end.saturating_sub(offset);
        result.replace_range(start..end, &edit.replacement);
    }
    result
}
