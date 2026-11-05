//! 单元测试：覆盖扩展名过滤、语法容错、各类 JSX 切块与降级路径。

use super::*;

fn run(code: &str, filename: &str) -> TransformResult {
    reactivue_transform(code.to_string(), filename.to_string(), None).unwrap()
}

/// 产物必须仍是合法 TSX，避免生成无法编译的代码。
fn assert_parses(code: &str) {
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
        .unwrap();
    let tree = parser.parse(code, None).unwrap();
    assert!(!tree.root_node().has_error(), "产物不是合法 TSX:\n{code}");
}

#[test]
fn keeps_unsupported_extension_untouched() {
    let code = "const a = <div v-memo={[x]} />";
    let result = run(code, "component.vue");
    assert_eq!(result.code, code);
}

#[test]
fn keeps_broken_syntax_untouched() {
    let code = "export const App = () => <div v-memo={[}";
    let result = run(code, "component.tsx");
    assert_eq!(result.code, code);
}

#[test]
fn respects_custom_formats() {
    let options = Some(TransformOptions {
        formats: Some(vec![".JS".to_string()]),
        granularity: Some("coarse".to_string()),
        strict: None,
    });
    let result =
        reactivue_transform("const a = 1".into(), "file.tsx".into(), options).unwrap();
    assert_eq!(result.code, "const a = 1");
}

#[test]
fn splits_text_binding_and_wraps_setup() {
    let code = "const A = defineComponent((props) => { const c = ref(0); return <h1>hi {c.value}</h1>; });";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("import { TextBinding as _TextBinding"));
    assert!(result.code.contains("createCompiledHost as _createCompiledHost"));
    assert!(result.code.contains("<_TextBinding value={() => (c.value)} />"));
    assert!(result.code.contains("return { render: () =>"));
    assert!(result.code.contains("_createCompiledHost((props)"));
    assert!(!result.code.contains("v-memo"));
    assert_parses(&result.code);
}

#[test]
fn splits_complex_expression_into_block() {
    let code = "const A = defineComponent(() => <main>{items.map(i => <li>{i.n}</li>)}</main>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("<_Block render={() => (items.map"));
    assert!(result.code.contains("<_TextBinding value={() => (i.n)} />"));
    assert!(result.code.contains("({ render: () =>"));
    assert_parses(&result.code);
}

#[test]
fn lifts_dynamic_attribute_element() {
    let code = "const A = defineComponent(() => <div className={c.value ? 'a' : 'b'}>static</div>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("<_Block render={() => (<div className="));
    assert!(!result.code.contains("v-memo"));
    assert_parses(&result.code);
}

#[test]
fn consumes_v_memo_into_memo_block() {
    let code = "const A = defineComponent(() => <p v-memo={[props.label]}>{n.value}</p>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("<_MemoBlock deps={() => ([props.label])}"));
    assert!(result.code.contains("render={() => (<p>"));
    assert!(!result.code.contains("v-memo="));
    assert!(result.code.contains("<_TextBinding value={() => (n.value)} />"));
    assert_parses(&result.code);
}

#[test]
fn non_array_v_memo_warns_and_degrades() {
    let code = "const A = defineComponent(() => <p v-memo={x}>{n.value}</p>);";
    let result = run(code, "a.tsx");
    assert_eq!(result.warnings.len(), 1);
    assert!(result.warnings[0].message.contains("数组字面量"));
    assert!(!result.code.contains("v-memo="));
    assert_parses(&result.code);
}

#[test]
fn v_memo_outside_define_component_is_consumed() {
    let code = "export const A = () => <p v-memo={[x]}>hello</p>;";
    let result = run(code, "a.tsx");
    assert!(!result.code.contains("v-memo="));
    assert!(result.code.contains("<_MemoBlock deps={() => ([x])}"));
    assert_eq!(result.warnings.len(), 1);
    assert!(!result.code.contains("_createCompiledHost"));
    assert_parses(&result.code);
}

#[test]
fn static_jsx_still_gets_host_wrapper() {
    let code = "const A = defineComponent(() => <div>static</div>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("_createCompiledHost"));
    assert!(result.code.contains("{ render: () =>"));
    assert_parses(&result.code);
}

#[test]
fn already_compiled_shape_is_not_double_wrapped() {
    let code = "const A = defineComponent(() => ({ render: () => <p>{n.value}</p> }));";
    let result = run(code, "a.tsx");
    assert_eq!(result.code.matches("{ render: () =>").count(), 1);
    assert!(result.code.contains("<_TextBinding"));
    assert_parses(&result.code);
}

#[test]
fn vueuse_composables_do_not_trigger_hook_warning() {
    // useNow/useToggle 来自 vue（alias 到 compat），不是 React hooks，应正常切块。
    let code = "import { useNow } from 'vue'; const A = defineComponent(() => { const n = useNow(); return <p>{n.value}</p>; });";
    let result = run(code, "a.tsx");
    assert!(result.warnings.is_empty(), "{:?}", result.warnings);
    assert!(result.code.contains("<_TextBinding"));
    assert_parses(&result.code);
}

#[test]
fn hooks_in_setup_skip_splitting_with_warning() {
    let code = "import { useContext } from 'react'; const A = defineComponent(() => { useContext(Ctx); return <p>{n.value}</p>; });";
    let result = run(code, "a.tsx");
    assert!(result.warnings.iter().any(|w| w.message.contains("hooks")));
    assert!(!result.code.contains("_TextBinding"));
}

#[test]
fn strict_mode_turns_warnings_into_errors() {
    let code = "const A = defineComponent(() => <p v-memo={x}>{n.value}</p>);";
    let result = reactivue_transform(
        code.into(),
        "a.tsx".into(),
        Some(TransformOptions {
            strict: Some(true),
            ..TransformOptions::default()
        }),
    )
    .unwrap();
    assert!(!result.errors.is_empty());
    assert!(result.warnings.is_empty());
}

#[test]
fn coarse_granularity_emits_group_key() {
    let code = "const A = defineComponent(() => <div>{items.map(i => <li>{i.n}</li>)}</div>);";
    let result = reactivue_transform(
        code.into(),
        "a.tsx".into(),
        Some(TransformOptions {
            granularity: Some("coarse".to_string()),
            ..TransformOptions::default()
        }),
    )
    .unwrap();
    assert!(result.code.contains("groupKey=\"a.tsx#0\""));
    assert_parses(&result.code);
}

#[test]
fn avoids_identifier_collision() {
    let code = "const _TextBinding = 1; const A = defineComponent(() => <p>{n.value}</p>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("TextBinding as _TextBinding1"));
    assert!(result.code.contains("<_TextBinding1 value="));
}

#[test]
fn block_marker_becomes_single_block() {
    let code = "const A = defineComponent(() => <Block>{n.value}</Block>);";
    let result = run(code, "a.tsx");
    assert!(result.code.contains("<_Block render={() => (<>"));
    assert!(!result.code.contains("<Block>"));
    assert_parses(&result.code);
}

#[test]
fn exposes_source_edits_for_sourcemap() {
    let code = "const A = defineComponent(() => <p>{n.value}</p>);";
    let result = run(code, "a.tsx");
    assert!(!result.edits.is_empty());
    // 至少包含 defineComponent → createCompiledHost 的标识符替换
    assert!(result
        .edits
        .iter()
        .any(|edit| edit.replacement.contains("createCompiledHost")));
    // 未变化文件输出空编辑列表
    let untouched = run("const B = <p />;", "a.tsx");
    assert!(untouched.edits.is_empty());
}

#[test]
fn exposes_utf16_offsets_for_multibyte_source() {
    // 中文注释每个字符占 3 个 UTF-8 字节 / 1 个 UTF-16 code unit：
    // 输出偏移必须按 UTF-16 计，否则 JS 侧（MagicString）错位。
    let code = "const 说明 = 1;\nconst A = defineComponent(() => <p>{n.value}</p>);";
    let result = run(code, "a.tsx");
    assert!(!result.edits.is_empty());
    let identifier_edit = result
        .edits
        .iter()
        .find(|edit| edit.replacement.contains("createCompiledHost"))
        .expect("identifier edit 应存在");
    // defineComponent 在「中文行 + 换行 + const A = 」之后：
    // UTF-16 偏移 = "const 说明 = 1;\nconst A = ".chars().count()
    let expected_start = "const 说明 = 1;\nconst A = ".chars().count();
    assert_eq!(identifier_edit.start as usize, expected_start);
}
