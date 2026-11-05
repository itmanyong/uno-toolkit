// 数据类型与配置：napi 对外结构、内部 Config、编辑指令。
use napi_derive::napi;
use serde::Deserialize;

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub prefix: Option<String>,
    pub formats: Option<Vec<String>>,
    pub if_fallback: Option<String>,
    pub show_property: Option<String>,
    pub show_true_value: Option<String>,
    pub show_false_value: Option<String>,
    /// R-A：输入中残留 v-memo 时的处理，'error'（默认）| 'preserve'。
    pub memo: Option<String>,
}

#[napi(object)]
pub struct Warning {
    pub message: String,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub warnings: Vec<Warning>,
    /// 编译期阻断错误（R-A：残留 v-memo），插件侧必须 throw。
    pub errors: Vec<Warning>,
}

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) prefix: String,
    pub(crate) formats: Vec<String>,
    pub(crate) if_fallback: String,
    pub(crate) show_property: String,
    pub(crate) show_true_value: String,
    pub(crate) show_false_value: String,
    pub(crate) memo: String,
}

impl From<Option<TransformOptions>> for Config {
    fn from(options: Option<TransformOptions>) -> Self {
        let options = options.unwrap_or_default();
        Self {
            prefix: options.prefix.unwrap_or_else(|| "v-".into()),
            formats: options
                .formats
                .unwrap_or_else(|| vec!["jsx".into(), "tsx".into()]),
            if_fallback: options.if_fallback.unwrap_or_else(|| "null".into()),
            show_property: options.show_property.unwrap_or_else(|| "display".into()),
            show_true_value: options
                .show_true_value
                .unwrap_or_else(|| "undefined".into()),
            show_false_value: options.show_false_value.unwrap_or_else(|| "'none'".into()),
            memo: options.memo.unwrap_or_else(|| "error".into()),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Edit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) replacement: String,
}
