// @uno-pc/jsx-directive 的 Rust 转换内核。
// 分层：types/config → utils/parser/shorthand/ast → directives/*（一指令一文件）→ render → entry。
mod ast;
mod directives;
mod entry;
mod parser;
mod render;
mod shorthand;
mod types;
mod utils;

#[cfg(test)]
mod tests;

pub use entry::jsx_directive;
#[allow(unused_imports)]
pub use types::{TransformOptions, TransformResult, Warning};
