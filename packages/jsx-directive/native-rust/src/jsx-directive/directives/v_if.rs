// v-if / v-else-if / v-else：把相邻 JSX 节点链降级为三元表达式。
use napi::bindgen_prelude::Result;
use tree_sitter::Node;

use crate::jsx_directive::ast::{
    comment_text, is_jsx_container, is_jsx_node, is_transparent,
    jsx_comment_as_js, only_transparent_between,
};
use crate::jsx_directive::directives::{Directive, directive_for, warn_orphan};
use crate::jsx_directive::render::render_node;
use crate::jsx_directive::types::{Config, Edit, Warning};

pub(crate) fn add_sequence_edits(
    parent: Node<'_>,
    children: &[Node<'_>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
    edits: &mut Vec<Edit>,
) -> Result<Vec<bool>> {
    let jsx = is_jsx_container(parent.kind());
    let mut eligible = vec![false; children.len()];
    if jsx {
        let mut in_children = false;
        for (index, child) in children.iter().enumerate() {
            if child.kind() == "jsx_opening_element" || child.kind() == "jsx_opening_fragment" {
                in_children = true;
                continue;
            }
            if child.kind() == "jsx_closing_element" || child.kind() == "jsx_closing_fragment" {
                in_children = false;
            }
            eligible[index] = in_children && is_jsx_node(child.kind());
        }
    } else {
        for (index, child) in children.iter().enumerate() {
            eligible[index] = is_jsx_node(child.kind());
        }
    }

    let mut covered = vec![false; children.len()];
    let mut index = 0;
    while index < children.len() {
        if !eligible[index] {
            index += 1;
            continue;
        }
        let node = children[index];
        let condition = match directive_for(node, source, config, warnings)? {
            Some(Directive::If(condition)) => condition,
            Some(Directive::ElseIf(_) | Directive::Else) => {
                warn_orphan(node, source, config, warnings)?;
                index += 1;
                continue;
            }
            None => {
                index += 1;
                continue;
            }
        };

        let mut branches = vec![(index, condition)];
        let mut comments = Vec::new();
        let mut cursor = index + 1;

        loop {
            let mut next = cursor;
            let mut between = Vec::new();
            while next < children.len() && is_transparent(children[next], source) {
                if let Some(comment) = comment_text(children[next], source) {
                    between.push(comment);
                }
                next += 1;
            }
            if next >= children.len() || !eligible[next] {
                break;
            }
            if !only_transparent_between(children, cursor - 1, next, source) {
                break;
            }
            match directive_for(children[next], source, config, warnings)? {
                Some(Directive::ElseIf(condition)) => {
                    comments.push(between);
                    branches.push((next, condition));
                    cursor = next + 1;
                }
                Some(Directive::Else) => {
                    comments.push(between);
                    branches.push((next, String::new()));
                    break;
                }
                _ => break,
            }
        }

        let last_branch_index = branches.last().map(|branch| branch.0).unwrap_or(index);
        let mut replacement = String::new();
        if jsx {
            replacement.push('{');
        } else {
            replacement.push('(');
        }
        replacement.push_str(&build_conditional(
            &branches, children, &comments, source, config, warnings,
        )?);
        if jsx {
            replacement.push('}');
        } else {
            replacement.push(')');
        }

        let start = children[index].start_byte();
        let end = children[last_branch_index].end_byte();
        covered[index..=last_branch_index].fill(true);
        edits.push(Edit {
            start,
            end,
            replacement,
        });
        index = last_branch_index + 1;
    }

    Ok(covered)
}

pub(crate) fn build_conditional(
    branches: &[(usize, String)],
    children: &[Node<'_>],
    comments: &[Vec<String>],
    source: &str,
    config: &Config,
    warnings: &mut Vec<Warning>,
) -> Result<String> {
    let rendered_branches = branches
        .iter()
        .map(|(index, condition)| {
            render_node(children[*index], source, config, warnings, true, None)
                .map(|branch| (condition, branch))
        })
        .collect::<Result<Vec<_>>>()?;

    let has_else = rendered_branches
        .last()
        .is_some_and(|(condition, _)| condition.is_empty());
    let conditional_count = rendered_branches.len() - usize::from(has_else);
    let mut result = if has_else {
        format!(
            "({})",
            rendered_branches.last().expect("else branch exists").1
        )
    } else {
        config.if_fallback.clone()
    };

    for branch_index in (0..conditional_count).rev() {
        let (condition, branch) = &rendered_branches[branch_index];
        let comments = comments
            .get(branch_index)
            .into_iter()
            .flatten()
            .map(|comment| jsx_comment_as_js(comment))
            .collect::<String>();
        result = format!("({condition}) ? ({branch}) : {comments}({result})");
    }
    Ok(result)
}

