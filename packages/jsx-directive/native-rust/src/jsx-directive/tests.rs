// 转换行为回归测试（原 mod tests 内容，未改动断言）。
use super::*;
use tree_sitter::Parser;

    fn transform_source(source: &str) -> TransformResult {
        jsx_directive(
            source.into(),
            "fixture.tsx".into(),
            Some(TransformOptions::default()),
        )
        .unwrap_or_else(|error| panic!("fixture should transform: {error}; source={source}"))
    }

    fn assert_tsx_parses(source: &str) {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("TSX parser should initialize");
        let tree = parser.parse(source, None).expect("TSX should parse");
        assert!(!tree.root_node().has_error(), "{source}");
    }

    fn transform_with(source: &str, options: TransformOptions) -> TransformResult {
        jsx_directive(source.into(), "fixture.tsx".into(), Some(options))
            .unwrap_or_else(|error| panic!("fixture should transform: {error}; source={source}"))
    }

    #[test]
    fn 残留v_memo默认产出编译期错误() {
        let code = "const A = () => <p v-memo={[x]}>hi</p>;";
        let result = transform_source(code);
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("@uno-pc/reactivue"));
        // 语法层不擅自改写：属性原样保留，由插件 throw 阻断。
        assert!(result.code.contains("v-memo"));
    }

    #[test]
    fn memo_preserve关闭报错且保留属性() {
        let code = "const A = () => <p v-memo={[x]}>hi</p>;";
        let result = transform_with(
            code,
            TransformOptions {
                memo: Some("preserve".into()),
                ..TransformOptions::default()
            },
        );
        assert!(result.errors.is_empty());
        assert!(result.code.contains("v-memo"));
    }

    #[test]
    fn 无v_memo的常规指令不产生错误() {
        let result = transform_source("const A = () => <p v-if={ok}>hi</p>;");
        assert!(result.errors.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 自定义前缀的memo同样报错() {
        let code = "const A = () => <p x-memo={[x]}>hi</p>;";
        let result = transform_with(
            code,
            TransformOptions {
                prefix: Some("x-".into()),
                ..TransformOptions::default()
            },
        );
        assert_eq!(result.errors.len(), 1);
    }

    #[test]
    fn 嵌套v_memo逐个报错() {
        let code = "const A = () => <div v-memo={[a]}><p v-memo={[b]}>hi</p></div>;";
        let result = transform_source(code);
        assert_eq!(result.errors.len(), 2);
    }

    #[test]
    fn 列表支持根节点嵌套与条件优先级() {
        for source in [
            "const view = <li v-for={item in items}>{item}</li>",
            "<ul><li v-for={(item, index) in items} key={index}>{item}</li></ul>",
            "<><Item v-if={ready} v-for={item in items} item={item} /><Empty v-else /></>",
            "<ul><li v-for={item in items}><b v-for={child in item.children}>{child}</b></li></ul>",
        ] {
            let result = transform_source(source);
            assert!(result.warnings.is_empty(), "{source}");
            assert!(!result.code.contains("v-for"), "{}", result.code);
            assert!(result.code.contains(".map((item"), "{}", result.code);
            assert_tsx_parses(&result.code);
        }
        let result = transform_source("<Item v-if={ready} v-for={item in items} />");
        assert!(result.code.find("(ready) ?").unwrap() < result.code.find(".map").unwrap());
        for source in [
            "<Item v-for=\"item in items\" />",
            "<div v-bind:title=\"title\" />",
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, source);
            assert_eq!(result.warnings.len(), 1);
        }
    }

    #[test]
    fn 模型转换原生控件与自定义组件() {
        for (source, expected) in [
            (
                "<input v-model={firstName} />",
                "value={firstName} onChange={event => (setFirstName)(event.currentTarget.value)}",
            ),
            (
                "<textarea v-model={[text, update]} />",
                "value={text} onChange={event => (update)(event.currentTarget.value)}",
            ),
            (
                "<input type=\"checkbox\" v-model={checked} />",
                "checked={checked} onChange={event => (setChecked)(event.currentTarget.checked)}",
            ),
            (
                "<input type=\"checkbox\" value={option} v-model={choices} />",
                "checked={(choices).includes(option)} onChange={event => (setChoices)(event.currentTarget.checked ? [...(choices), (option)] : (choices).filter(__item => __item !== (option)))}",
            ),
            (
                "<input type=\"radio\" value={option} v-model={choice} />",
                "checked={(choice) === (option)} onChange={event => (setChoice)(option)}",
            ),
            (
                "<select v-model={choice} />",
                "value={choice} onChange={event => (setChoice)(event.currentTarget.value)}",
            ),
            (
                "<select multiple v-model={[choices, update]} />",
                "Array.from(event.currentTarget.selectedOptions, option => option.value)",
            ),
            (
                "<Field v-model={name} />",
                "modelValue={name} onUpdateModelValue={value => (setName)(value)}",
            ),
            (
                "<Field v-model:first={[name, update]} />",
                "first={name} onUpdateFirst={value => (update)(value)}",
            ),
            (
                "<input v-model={keyword} />",
                "value={keyword} onChange={event => (setKeyword)(event.currentTarget.value)}",
            ),
            (
                "<Field v-model={email} />",
                "modelValue={email} onUpdateModelValue={value => (setEmail)(value)}",
            ),
            (
                "<Field v-model:first={[first, update]} />",
                "first={first} onUpdateFirst={value => (update)(value)}",
            ),
            (
                "<input type=\"checkbox\" :value={option} v-model={choices} />",
                "checked={(choices).includes(option)}",
            ),
            (
                "<select multiple={many} v-model={choice} />",
                "event.currentTarget.multiple ? Array.from(event.currentTarget.selectedOptions, option => option.value) : event.currentTarget.value",
            ),
            (
                "<input v-model={[text, event]} />",
                "event1 => (event)(event1.currentTarget.value)",
            ),
            (
                "<Field v-model={[name, value]} />",
                "value1 => (value)(value1)",
            ),
        ] {
            let result = transform_source(source);
            assert!(result.warnings.is_empty(), "{source}");
            assert!(result.code.contains(expected), "{}", result.code);
            assert!(!result.code.contains("v-model"));
            assert_tsx_parses(&result.code);
        }
    }

    #[test]
    fn 模型无效表达式和显式属性冲突保留原文并警告() {
        for source in [
            "<input v-model={state.name} />",
            "<input value={name} v-model={name} />",
            "<Field onUpdateModelValue={update} v-model={name} />",
            "<input type={kind} v-model={name} />",
            "<input v-model={[, name, setter]} />",
            "<input v-model={[name,, setter]} />",
            "<input v-model=\"name\" />",
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, source);
            assert_eq!(result.warnings.len(), 1);
        }
    }

    #[test]
    fn 简写仅转换开标签属性并保持原始偏移() {
        for (source, expected) in [
            ("<div :title={title} />", "<div title={title} />"),
            (
                "const text = '<div :title={title}/>'; const view = <div :title={title} />",
                "const text = '<div :title={title}/>'; const view = <div title={title} />",
            ),
            (
                "/* <div :title={title}/> */ const view = <div :title={title} />",
                "/* <div :title={title}/> */ const view = <div title={title} />",
            ),
            (
                "<div title=\":literal\"> :text 'quote {ok && <span :title={title}/>}</div>",
                "<div title=\":literal\"> :text 'quote {ok && <span title={title}/>}</div>",
            ),
            (
                "const pattern = /<div :title/; const view = <div :title={title} />",
                "const pattern = /<div :title/; const view = <div title={title} />",
            ),
            (
                "const x = `<div :title/> ${<span :title={title}/>}`",
                "const x = `<div :title/> ${<span title={title}/>}`",
            ),
            (
                "const f = <T,>(x: T) => <div :title={title} />",
                "const f = <T,>(x: T) => <div title={title} />",
            ),
        ] {
            let result = transform_source(source);
            assert_eq!(result.code, expected);
            assert_tsx_parses(&result.code);
        }
        let source = "const small = a<b ? c : d; const view = <div v-if={ready} />";
        let result = transform_source(source);
        assert!(result.code.contains("a<b ? c : d"), "{}", result.code);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 内容指令替换原有子节点并处理冲突() {
        let html = transform_source("<div v-html={markup}><span>old</span></div>");
        assert_eq!(
            html.code,
            "<div dangerouslySetInnerHTML={{ __html: markup }}></div>"
        );
        let text = transform_source("<div v-text={message}>old</div>");
        assert_eq!(text.code, "<div >{message}</div>");
        let source = "<div v-html={markup} v-text={message}>old</div>";
        let conflict = transform_source(source);
        assert_eq!(conflict.code, source);
        assert_eq!(conflict.warnings.len(), 1);
        assert_tsx_parses(&html.code);
        assert_tsx_parses(&text.code);
    }

    #[test]
    fn 绑定属性和对象() {
        let result = transform_source("<div v-bind:title={title} v-bind={props} />");
        assert_eq!(result.code, "<div title={title} {...(props)} />");
        assert_tsx_parses(&result.code);
        for source in [
            "<div v-bind:title={title} :id={elementId} v-bind={props} className=\"literal\" />",
            "<div v-bind:title=\"title\" />",
        ] {
            let result = transform_source(source);
            if source == "<div v-bind:title=\"title\" />" {
                assert_eq!(result.code, source);
                assert_eq!(result.warnings.len(), 1);
            } else {
                assert_eq!(
                    result.code,
                    "<div title={title} id={elementId} {...(props)} className=\"literal\" />"
                );
                assert!(result.warnings.is_empty());
            }
            assert_tsx_parses(&result.code);
        }
    }

    #[test]
    fn 相邻条件分支保留注释() {
        let result = transform_source(
            "<><A v-if={first} />{/* keep */}<B v-else-if={second} /><C v-else /></>",
        );

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("/* keep */"));
        assert!(result.code.contains("(second) ? (<B />)"));
        assert!(result.code.contains("(<C />)"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 空白与换行不会中断分支链() {
        let result = transform_source("<><A v-if={first} />\n  <B v-else /></>");

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("<B />"));
        assert!(!result.code.contains("v-else"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 多行缩进的条件链被合并() {
        let result = transform_source(
            "<>\n  <A v-if={first} />\n  <B v-else-if={second} />\n  <C v-else />\n</>",
        );

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("(second) ? (<B />)"));
        assert!(result.code.contains("(<C />)"));
        assert!(!result.code.contains("v-else"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn v_show会合并现有样式() {
        let result = transform_source("<div style={{ color: 'red' }} v-show={visible} />");

        assert!(result.code.contains(
            "style={{...({ color: 'red' }), [\"display\"]: (visible) ? (undefined) : ('none')}}"
        ));
        assert!(!result.code.contains("v-show"));
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 数组分隔符会中断分支链() {
        let result = transform_source("const items = [<A v-if={first} />, <B v-else />];");

        assert!(result.code.contains("(first) ? (<A />) : (null)"));
        assert!(result.code.contains("<B v-else />"));
        assert_eq!(result.warnings.len(), 1);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 函数参数分隔符会中断分支链() {
        let result = transform_source(
            "const result = render(<A v-if={first} />, <B v-else-if={second} />, <C v-else />);",
        );

        assert!(result.code.contains("(first) ? (<A />) : (null)"));
        assert!(result.code.contains("<B v-else-if={second} />"));
        assert!(result.code.contains("<C v-else />"));
        assert_eq!(result.warnings.len(), 2);
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 注释周围的空白不会中断分支链() {
        let result = transform_source("<><A v-if={first} /> {/* keep */}<B v-else /></>");

        assert!(result.code.contains("(first) ? (<A />)"));
        assert!(result.code.contains("/* keep */"));
        assert!(result.code.contains("(<B />)"));
        assert!(!result.code.contains("<B v-else />"));
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn v_show为自闭合元素创建样式() {
        let result = transform_source("<div v-show={visible} />");

        assert!(
            result
                .code
                .contains("style={{[\"display\"]: (visible) ? (undefined) : ('none')}}")
        );
        assert!(result.warnings.is_empty());
        assert_tsx_parses(&result.code);
    }

    #[test]
    fn 支持自定义前缀和显示值() {
        let result = jsx_directive(
            "<div x-show={active} />".into(),
            "fixture.jsx".into(),
            Some(TransformOptions {
                prefix: Some("x-".into()),
                formats: Some(vec![".jsx".into()]),
                show_property: Some("visibility".into()),
                show_true_value: Some("'visible'".into()),
                show_false_value: Some("'hidden'".into()),
                ..TransformOptions::default()
            }),
        )
        .expect("custom options should transform");

        assert!(
            result
                .code
                .contains("[\"visibility\"]: (active) ? ('visible') : ('hidden')")
        );
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 孤立的v_else保持不变并发出警告() {
        let result = transform_source("<div v-else />");

        assert_eq!(result.code, "<div v-else />");
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].message.contains("Orphaned v-else"));
    }

    #[test]
    fn 孤立的v_else_if和无效v_if语法会发出警告() {
        let orphan = transform_source("<div v-else-if={condition} />");
        let invalid = transform_source("<div v-if=\"condition\" />");

        assert_eq!(orphan.warnings.len(), 1);
        assert!(orphan.warnings[0].message.contains("Orphaned v-else-if"));
        assert_eq!(orphan.code, "<div v-else-if={condition} />");
        assert_eq!(invalid.warnings.len(), 1);
        assert!(
            invalid.warnings[0]
                .message
                .contains("must use expression syntax")
        );
        assert_eq!(invalid.code, "<div v-if=\"condition\" />");
    }

    #[test]
    fn 跳过未配置的文件格式() {
        let source = "<div v-show={visible} />";
        let result = jsx_directive(
            source.into(),
            "fixture.js".into(),
            Some(TransformOptions::default()),
        )
        .expect("unsupported format should be ignored");

        assert_eq!(result.code, source);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn 没有指令候选时跳过解析() {
        let source = "const value: = <div />;";
        let result = jsx_directive(
            source.into(),
            "fixture.tsx".into(),
            Some(TransformOptions::default()),
        )
        .expect("source without directives should use the fast path");

        assert_eq!(result.code, source);
        assert!(result.warnings.is_empty());
    }


#[test]
fn exposes_source_edits_with_utf16_offsets() {
    let code = "const 说明 = 1;\nconst A = () => <div v-show={visible} />;";
    let result = transform_source(code);
    assert!(!result.edits.is_empty(), "v-show 变换应产生编辑");
    // 所有编辑偏移必须落在 UTF-16 边界内（不越过原码字符数）
    let char_len = code.chars().count();
    for edit in &result.edits {
        assert!(edit.start <= char_len as u32);
        assert!(edit.end <= char_len as u32);
    }
    // 存在 v-show 的样式属性编辑
    assert!(result
        .edits
        .iter()
        .any(|edit| edit.replacement.contains("display")));
}
