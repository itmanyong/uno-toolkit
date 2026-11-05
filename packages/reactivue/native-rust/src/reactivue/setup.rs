//! defineComponent 产物组装：按编译上下文中记录的运行时符号生成 import 语句。

use super::types::Ctx;

pub(crate) fn build_import(ctx: &Ctx<'_>) -> Option<String> {
    let mut bindings = Vec::new();
    if ctx.used.text {
        bindings.push(format!("TextBinding as {}", ctx.names.text));
    }
    if ctx.used.block {
        bindings.push(format!("Block as {}", ctx.names.block));
    }
    if ctx.used.memo {
        bindings.push(format!("MemoBlock as {}", ctx.names.memo));
    }
    if ctx.used.host {
        bindings.push(format!("createCompiledHost as {}", ctx.names.host));
    }
    if bindings.is_empty() {
        return None;
    }
    Some(format!(
        "import {{ {} }} from '@uno-pc/reactivue/internal';\n",
        bindings.join(", ")
    ))
}
