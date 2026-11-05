// 单元测试：覆盖自动/手动/全部模式、自定义导入源、跳过解析错误、嵌套组件等转换行为。

use super::*;

fn transform_source(source: &str, mode: Option<&str>) -> TransformResult {
    transform_signals(
        source.into(),
        "fixture.tsx".into(),
        TransformOptions {
            mode: mode.map(str::to_string),
            ..TransformOptions::default()
        },
    )
    .expect("valid TSX source should transform")
}

#[test]
fn 自动模式为读取信号的组件注入跟踪() {
    let result = transform_source(
        "const count = signal(0); function Counter() { return <p>{count.value}</p>; }",
        None,
    );

    assert!(result.code.contains("_useSignals(1)"));
    assert!(result.code.contains("finally"));
    assert!(
        result
            .code
            .contains("from \"@preact/signals-react/runtime\"")
    );
    assert!(!result.code.contains("function Counter() { return <p>"));
}

#[test]
fn 自动模式为使用信号的自定义钩子注入托管跟踪() {
    let result = transform_source("function useCounter() { return count.value; }", None);

    assert!(result.code.contains("_useSignals(2)"));
    assert!(result.code.contains("_effect.f()"));
}

#[test]
fn 自动模式识别value解构和箭头组件() {
    let destructured = transform_source(
        "function Counter() { const { value } = count; return <p>{value}</p>; }",
        None,
    );
    let arrow = transform_source("const Counter = () => <p>{count.value}</p>;", None);

    assert!(destructured.code.contains("_useSignals(1)"));
    assert!(arrow.code.contains("_useSignals(1)"));
}

#[test]
fn 手动模式需要显式启用并尊重排除标记() {
    let skipped = transform_source(
        "function Counter() { return <p>{count.value}</p>; }",
        Some("manual"),
    );
    let included = transform_source(
        "/** @useSignals */ function Counter() { return <p />; }",
        Some("manual"),
    );
    let opted_out = transform_source(
        "/** @useSignals */ /** @noUseSignals */ function Counter() { return <p />; }",
        Some("all"),
    );

    assert_eq!(
        skipped.code,
        "function Counter() { return <p>{count.value}</p>; }"
    );
    assert!(included.code.contains("_useSignals(1)"));
    assert_eq!(
        opted_out.code,
        "/** @useSignals */ /** @noUseSignals */ function Counter() { return <p />; }"
    );
}

#[test]
fn 全部模式转换未读取信号的组件() {
    let result = transform_source("function Counter() { return <p>static</p>; }", Some("all"));

    assert!(result.code.contains("_useSignals(1)"));
}

#[test]
fn 支持自定义导入源和已转换jsx检测() {
    let result = transform_signals(
        "import { jsx as _jsx } from \"react/jsx-runtime\"; function Counter() { return _jsx(\"p\", { children: count.value }); }"
            .into(),
        "fixture.js".into(),
        TransformOptions {
            import_source: Some("custom-signals".into()),
            detect_transformed_jsx: Some(true),
            ..TransformOptions::default()
        },
    )
    .expect("valid JavaScript source should transform");

    assert!(result.code.contains("from \"custom-signals\""));
    assert!(result.code.contains("_useSignals(1)"));
    assert!(result.code.contains("_jsx(\"p\""));
}

#[test]
fn 跳过无法由类型脚本解析器处理的源码() {
    let source = "const value = await using resource = openResource();";
    let result = transform_source(source, Some("all"));

    assert_eq!(result.code, source);
    assert!(result.warnings.is_empty());
}

#[test]
fn 转换嵌套组件时保留内部修改() {
    let result = transform_source(
        "function Outer() { function Inner() { return <p>{count.value}</p>; } return <Inner />; }",
        Some("all"),
    );

    assert_eq!(result.code.matches("_useSignals(1)").count(), 2);
}
