// style_rewrite 模块编排：仅声明子模块并重导出 napi 绑定所需函数。

mod declarations;
mod engine;
mod minify;
mod rules;
mod selector;

#[cfg(test)]
mod tests;

pub use engine::{RewriteRule, rewrite_css};
pub use minify::minify_css;
