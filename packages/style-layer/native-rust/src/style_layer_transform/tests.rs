// 单元测试：覆盖 layer 包裹、前置规则保留、已有 layer 跳过、导入目标识别等。

use super::{style_layer_import_targets, transform_style_layer, transform_style_layer_imports};

#[test]
fn 将样式包裹在命名层中() {
    let result = transform_style_layer(
        ".button { color: red; }".to_owned(),
        "components".to_owned(),
        true,
        true,
    );

    assert_eq!(result, "@layer components {\n.button { color: red; }\n}");
}

#[test]
fn 保留前置规则并为导入添加层() {
    let result = transform_style_layer(
        "@charset \"UTF-8\";\n@import \"theme.css\" screen;\n@namespace svg url(http://www.w3.org/2000/svg);\n.button { color: red; }".to_owned(),
        "vendor".to_owned(),
        true,
        true,
    );

    assert_eq!(
        result,
        "@charset \"UTF-8\";\n\n@import \"theme.css\" layer(vendor) screen;\n\n@namespace svg url(http://www.w3.org/2000/svg);\n\n@layer vendor {\n.button { color: red; }\n}"
    );
}

#[test]
fn 配置跳过已有层() {
    let code = "@layer base { body { margin: 0; } }".to_owned();
    assert_eq!(
        transform_style_layer(code.clone(), "vendor".to_owned(), true, true),
        code
    );
}

#[test]
fn 忽略注释和字符串中的层声明() {
    let code = "/* @layer fake */\n.content::before { content: \"@layer fake\"; }".to_owned();
    let result = transform_style_layer(code, "components".to_owned(), true, true);

    assert!(result.starts_with("@layer components {"));
}

#[test]
fn 保留已有层声明的导入() {
    let result = transform_style_layer(
        "@import url(\"theme.css\") layer(theme) screen;\nbody { color: black; }".to_owned(),
        "vendor".to_owned(),
        true,
        true,
    );

    assert!(result.contains("@import url(\"theme.css\") layer(theme) screen;"));
    assert!(!result.contains("layer(theme) layer(vendor)"));
}

#[test]
fn 保留样式文件开头的注释() {
    let result = transform_style_layer(
        "/* license */\n@import \"theme.css\";\nbody { color: black; }".to_owned(),
        "vendor".to_owned(),
        true,
        true,
    );

    assert!(result.starts_with("/* license */\n\n@import \"theme.css\" layer(vendor);"));
}

#[test]
fn 可选择不为导入添加层() {
    let result = transform_style_layer(
        "@import \"theme.css\";\nbody { color: black; }".to_owned(),
        "vendor".to_owned(),
        true,
        false,
    );

    assert!(result.starts_with("@import \"theme.css\";"));
    assert!(result.contains("@layer vendor {"));
}

#[test]
fn 仅为匹配的样式导入添加层() {
    let code = "@layer base, utilities;\n@import \"tailwindcss\";\n@import \"@radix-ui/themes/components.css\";\nbody { color: black; }".to_owned();
    let result = transform_style_layer_imports(
        code,
        vec![(
            "@radix-ui/themes/components.css".to_owned(),
            "radix-ui".to_owned(),
        )],
    );

    assert!(result.contains("@import \"tailwindcss\";"));
    assert!(result.contains("@import \"@radix-ui/themes/components.css\" layer(radix-ui);"));
}

#[test]
fn 识别带注释和函数形式的样式导入() {
    let code = "/* @import \"ignored.css\"; */\n@import url(\"@radix-ui/themes/components.css\") screen;\n.test { content: \"@import 'ignored.css';\"; }".to_owned();
    assert_eq!(
        style_layer_import_targets(&code),
        vec!["@radix-ui/themes/components.css"]
    );
}
