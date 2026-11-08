// 数据类型与配置：napi 对外结构、内部 Config、编辑指令。
use napi_derive::napi;
use serde::Deserialize;

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub prefix: Option<Vec<String>>,
    pub formats: Option<Vec<String>>,
    pub if_fallback: Option<String>,
    pub show_property: Option<String>,
    pub show_true_value: Option<String>,
    pub show_false_value: Option<String>,
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
    /// 编译期阻断错误，插件侧必须 throw。
    pub errors: Vec<Warning>,
    /// 顶层编辑区间（原码 UTF-16 偏移 → 替换文本），供 TS 侧生成 source map。
    pub edits: Vec<SourceEdit>,
}

#[napi(object)]
#[derive(Debug)]
pub struct SourceEdit {
    pub start: u32,
    pub end: u32,
    pub replacement: String,
}

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) prefixes: Vec<String>,
    pub(crate) formats: Vec<String>,
    pub(crate) if_fallback: String,
    pub(crate) show_property: String,
    pub(crate) show_true_value: String,
    pub(crate) show_false_value: String,
}

impl Config {
    /// 尝试按任意已配置前缀剥离属性名，返回剩余后缀。
    pub(crate) fn strip_prefix<'a>(&self, name: &'a str) -> Option<&'a str> {
        self.prefixes
            .iter()
            .find_map(|prefix| name.strip_prefix(prefix.as_str()))
    }

    /// 判断属性名是否等于“任意前缀 + 指定后缀”。
    pub(crate) fn matches_suffix(&self, name: &str, suffix: &str) -> bool {
        self.prefixes
            .iter()
            .any(|prefix| name == format!("{prefix}{suffix}"))
    }
}

impl From<Option<TransformOptions>> for Config {
    fn from(options: Option<TransformOptions>) -> Self {
        let options = options.unwrap_or_default();
        Self {
            prefixes: options.prefix.unwrap_or_else(|| vec!["x-".into()]),
            formats: options
                .formats
                .unwrap_or_else(|| vec!["jsx".into(), "tsx".into()]),
            if_fallback: options.if_fallback.unwrap_or_else(|| "null".into()),
            show_property: options.show_property.unwrap_or_else(|| "display".into()),
            show_true_value: options
                .show_true_value
                .unwrap_or_else(|| "undefined".into()),
            show_false_value: options.show_false_value.unwrap_or_else(|| "'none'".into()),
        }
    }
}

#[derive(Clone)]
pub(crate) struct Edit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) replacement: String,
}