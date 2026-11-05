// v-bind / :简写：属性绑定与对象展开的替换文本生成。
use tree_sitter::Node;

use crate::jsx_directive::ast::directive_expression;
use crate::jsx_directive::types::Warning;

/// `v-bind:title={x}` / `:title={x}` → `title={x}`
pub(crate) fn render_argument(
    argument: &str,
    attribute: &Node<'_>,
    name: &str,
    source: &str,
    warnings: &mut Vec<Warning>,
) -> Option<String> {
            if argument.is_empty() {
                None
            } else {
                let expression = directive_expression(*attribute, source);
                if expression.is_none() {
                    warnings.push(Warning {
                        message: format!(
                            "{name} must use JSX expression syntax, for example {name}={{value}}"
                        ),
                        start: attribute.start_byte() as u32,
                        end: attribute.end_byte() as u32,
                    });
                }
                expression.map(|expression| format!("{argument}={{{expression}}}"))
            }
}

/// `v-bind={props}` → `{...(props)}`
pub(crate) fn render_object(
    attribute: &Node<'_>,
    name: &str,
    source: &str,
    warnings: &mut Vec<Warning>,
) -> Option<String> {
            let expression = directive_expression(*attribute, source);
            if expression.is_none() {
                warnings.push(Warning {
                    message: format!(
                        "{name} must use JSX expression syntax, for example {name}={{attrs}}"
                    ),
                    start: attribute.start_byte() as u32,
                    end: attribute.end_byte() as u32,
                });
            }
            expression.map(|expression| format!("{{...({expression})}}"))
}
