// 类型定义：转换选项、内部配置、候选函数信息与文本编辑记录。

use napi_derive::napi;
use serde::Deserialize;

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub mode: Option<String>,
    pub import_source: Option<String>,
    pub detect_transformed_jsx: Option<bool>,
    pub formats: Option<Vec<String>>,
}

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) mode: String,
    pub(crate) import_source: String,
    pub(crate) detect_transformed_jsx: bool,
    pub(crate) formats: Vec<String>,
}

impl From<TransformOptions> for Config {
    fn from(options: TransformOptions) -> Self {
        Self {
            mode: options.mode.unwrap_or_else(|| "auto".into()),
            import_source: options
                .import_source
                .unwrap_or_else(|| "@preact/signals-react/runtime".into()),
            detect_transformed_jsx: options.detect_transformed_jsx.unwrap_or(false),
            formats: options
                .formats
                .unwrap_or_else(|| vec!["js".into(), "jsx".into(), "ts".into(), "tsx".into()]),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Candidate {
    pub(crate) body_start: usize,
    pub(crate) body_end: usize,
    pub(crate) is_block: bool,
    pub(crate) is_component: bool,
    pub(crate) is_hook: bool,
    pub(crate) opted_in: bool,
    pub(crate) opted_out: bool,
    pub(crate) has_jsx: bool,
    pub(crate) uses_signal: bool,
}

#[derive(Clone)]
pub(crate) struct Edit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) replacement: String,
}
