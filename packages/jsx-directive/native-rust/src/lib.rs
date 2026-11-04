#[path = "jsx-directive/mod.rs"]
mod jsx_directive;

use jsx_directive::{TransformOptions, TransformResult, jsx_directive};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn transform(
    code: String,
    filename: String,
    options: Option<TransformOptions>,
) -> Result<TransformResult> {
    jsx_directive(code, filename, options)
}
