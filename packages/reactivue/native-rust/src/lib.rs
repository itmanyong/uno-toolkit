#[path = "reactivue/mod.rs"]
mod reactivue;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reactivue::{TransformOptions, TransformResult, reactivue_transform};

#[napi]
pub fn transform(
    code: String,
    filename: String,
    options: Option<TransformOptions>,
) -> Result<TransformResult> {
    reactivue_transform(code, filename, options)
}
