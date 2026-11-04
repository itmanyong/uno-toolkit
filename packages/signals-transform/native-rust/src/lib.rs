mod signals_transform;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use signals_transform::TransformOptions;

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
}

#[napi]
pub fn transform(
    code: String,
    filename: String,
    options: Option<TransformOptions>,
) -> Result<TransformResult> {
    signals_transform::transform_signals(code, filename, options.unwrap_or_default())
}
