mod style_rewrite;

use napi_derive::napi;

#[napi(object)]
pub struct RewriteRule {
    pub match_reg: Vec<String>,
    pub rewrite: String,
    pub rewrite_type: String,
}

#[napi]
pub fn rewrite_css(code: String, rules: Vec<RewriteRule>) -> String {
    let rules = rules
        .into_iter()
        .map(|rule| style_rewrite::RewriteRule {
            match_reg: rule.match_reg,
            rewrite: rule.rewrite,
            rewrite_type: rule.rewrite_type,
        })
        .collect::<Vec<_>>();
    style_rewrite::rewrite_css(&code, &rules)
}

#[napi]
pub fn minify_css(code: String) -> String {
    style_rewrite::minify_css(&code)
}
