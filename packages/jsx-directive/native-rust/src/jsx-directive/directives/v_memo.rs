// v-memo（R-A 语法外壳）：reactivue 插件应先消费；残留即编译期错误。
use tree_sitter::Node;

use crate::jsx_directive::types::Warning;

pub(crate) fn collect_memo_errors(node: Node<'_>, source: &str, prefix: &str, out: &mut Vec<Warning>) {
    if node.kind() == "jsx_attribute" {
        if let Some(name_node) = node.child(0) {
            let name = &source[name_node.start_byte()..name_node.end_byte()];
            if name == format!("{prefix}memo") {
                out.push(Warning {
                    message: "[jsx-directive] v-memo requires @uno-pc/reactivue. Install it and register its Vite/Rsbuild plugin (transform order is handled by the plugins).".into(),
                    start: node.start_byte() as u32,
                    end: node.end_byte() as u32,
                });
            }
        }
    }
    for index in 0..node.named_child_count() {
        if let Some(child) = node.named_child(index) {
            collect_memo_errors(child, source, prefix, out);
        }
    }
}

