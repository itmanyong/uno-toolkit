// signals_transform 模块编排：仅声明子模块并重导出对外/测试所需项。

mod detect;
mod entry;
mod inject;
mod types;

#[cfg(test)]
mod tests;

#[cfg(test)]
use crate::TransformResult;

pub use entry::transform_signals;
pub use types::TransformOptions;
