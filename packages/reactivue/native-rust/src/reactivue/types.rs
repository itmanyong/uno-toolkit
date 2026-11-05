//! 数据类型定义：napi object 结构体、编辑记录、编译上下文与 JSX 切块分类。

use napi_derive::napi;
use serde::Deserialize;

#[napi(object)]
#[derive(Clone, Default, Deserialize)]
pub struct TransformOptions {
    pub formats: Option<Vec<String>>,
    pub granularity: Option<String>,
    pub strict: Option<bool>,
}

#[napi(object)]
#[derive(Debug)]
pub struct Warning {
    pub message: String,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub warnings: Vec<Warning>,
    pub errors: Vec<Warning>,
}

#[derive(Clone)]
pub(crate) struct Edit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) replacement: String,
}

pub(crate) struct Names {
    pub(crate) text: String,
    pub(crate) block: String,
    pub(crate) memo: String,
    pub(crate) host: String,
}

pub(crate) struct Ctx<'a> {
    pub(crate) source: &'a str,
    pub(crate) names: Names,
    pub(crate) warnings: Vec<Warning>,
    pub(crate) errors: Vec<Warning>,
    pub(crate) strict: bool,
    pub(crate) coarse: bool,
    pub(crate) group: String,
    pub(crate) used: Used,
}

#[derive(Default)]
pub(crate) struct Used {
    pub(crate) text: bool,
    pub(crate) block: bool,
    pub(crate) memo: bool,
    pub(crate) host: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RenderKind {
    /// return <JSX /> —— 需包装成 { render: () => ... }
    Direct,
    /// () => <JSX /> —— 需包装成 () => ({ render: () => ... })
    ArrowExpression,
    /// 已是 { render: () => <JSX /> } 或 () => JSX —— 只切内部 JSX
    Ready,
}
