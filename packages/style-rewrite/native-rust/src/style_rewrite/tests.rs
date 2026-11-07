// 单元测试：覆盖压缩、字面量/正则匹配、选择器识别、replace/append 与多规则叠加。

use super::{RewriteRule, minify_css, rewrite_css};

fn rule(match_reg: &[&str], rewrite: &str, rewrite_type: &str) -> RewriteRule {
    RewriteRule {
        match_reg: match_reg.iter().map(|value| value.to_string()).collect(),
        rewrite: rewrite.to_owned(),
        rewrite_type: rewrite_type.to_owned(),
    }
}

#[test]
fn 压缩为单行并去掉注释与多余空白() {
    let code = "/* note */\n.card {\n  color: red;\n  padding: 0 8px;\n}\n";
    assert_eq!(minify_css(code), ".card{color:red;padding:0 8px}");
}

#[test]
fn 压缩保留字符串内容与后代选择器空格() {
    assert_eq!(
        minify_css(r#"a :hover { content: "a  {b}  c" ; }"#),
        r#"a :hover{content:"a  {b}  c"}"#
    );
    assert_eq!(minify_css(".a/**/.b { color: red }"), ".a.b{color:red}");
}

#[test]
fn 文本命中时替换匹配内容() {
    let result = rewrite_css(
        ".a{color:red}",
        &[rule(&["color:red"], "color:blue", "replace")],
    );
    assert_eq!(result, ".a{color:blue}");
}

#[test]
fn 文本命中时追加到匹配内容之后() {
    let result = rewrite_css(
        ".a{color:red}",
        &[rule(&["color:red"], ";padding:1px", "append")],
    );
    assert_eq!(result, ".a{color:red;padding:1px}");
}

#[test]
fn 选择器命中时替换整个声明块() {
    let result = rewrite_css(
        ".btn{color:red;padding:1px}",
        &[rule(&[".btn"], "color:blue", "replace")],
    );
    assert_eq!(result, ".btn{color:blue}");
}

#[test]
fn 选择器命中且属性不冲突时在声明块末尾追加() {
    let result = rewrite_css(".btn{color:red}", &[rule(&[".btn"], "padding:0", "append")]);
    assert_eq!(result, ".btn{color:red;padding:0}");
}

#[test]
fn 选择器追加时先移除同名样式再追加() {
    let result = rewrite_css(
        ".btn{color:red;padding:1px}",
        &[rule(&[".btn"], "color:blue", "append")],
    );
    assert_eq!(result, ".btn{padding:1px;color:blue}");
}

#[test]
fn 同一声明块内重复的同名样式全部移除() {
    let result = rewrite_css(
        ".btn{color:red;color:green;padding:0}",
        &[rule(&[".btn"], "color:blue", "append")],
    );
    assert_eq!(result, ".btn{padding:0;color:blue}");
}

#[test]
fn 追加内容含多条声明时逐条按名移除() {
    let result = rewrite_css(
        ".btn{color:red;margin:0;padding:1px}",
        &[rule(&[".btn"], "color:blue;padding:2px", "append")],
    );
    assert_eq!(result, ".btn{margin:0;color:blue;padding:2px}");
}

#[test]
fn 标准属性名大小写不敏感() {
    let result = rewrite_css(
        ".btn{COLOR:red;Padding:1px}",
        &[rule(&[".btn"], "color:blue", "append")],
    );
    assert_eq!(result, ".btn{Padding:1px;color:blue}");
}

#[test]
fn 自定义属性按大小写区分() {
    let result = rewrite_css(
        ".btn{--X:1px;--x:2px}",
        &[rule(&[".btn"], "--x:3px", "append")],
    );
    assert_eq!(result, ".btn{--X:1px;--x:3px}");
}

#[test]
fn 厂商前缀属性不互认同名() {
    let result = rewrite_css(
        ".btn{-webkit-transform:rotate(1deg);transform:scale(1)}",
        &[rule(&[".btn"], "transform:scale(2)", "append")],
    );
    assert_eq!(
        result,
        ".btn{-webkit-transform:rotate(1deg);transform:scale(2)}"
    );
}

#[test]
fn 旧声明带感叹号重要标记时同样被移除() {
    let result = rewrite_css(
        ".btn{color:red!important}",
        &[rule(&[".btn"], "color:blue", "append")],
    );
    assert_eq!(result, ".btn{color:blue}");
}

#[test]
fn 移除同名声明时保留嵌套规则() {
    let result = rewrite_css(
        ".a{color:red;&:hover{color:blue}}",
        &[rule(&[".a"], "color:green", "append")],
    );
    assert_eq!(result, ".a{&:hover{color:blue};color:green}");
}

#[test]
fn 值中含冒号与引号时不影响属性名解析() {
    let result = rewrite_css(
        r#".btn{background:url(a:b);content:"x:y"}"#,
        &[rule(&[".btn"], "background:url(c:d)", "append")],
    );
    assert_eq!(result, r#".btn{content:"x:y";background:url(c:d)}"#);
}

#[test]
fn 追加内容不含属性名时只追加不移除() {
    let result = rewrite_css(".btn{color:red}", &[rule(&[".btn"], "red", "append")]);
    assert_eq!(result, ".btn{color:red;red}");
}

#[test]
fn 空声明块追加时直接写入() {
    let result = rewrite_css(".btn{}", &[rule(&[".btn"], "color:blue", "append")]);
    assert_eq!(result, ".btn{color:blue}");
}

#[test]
fn 嵌套声明块追加时先闭合再追加() {
    let result = rewrite_css(
        ".a{color:red;&:hover{color:blue}}",
        &[rule(&[".a"], "background:white", "append")],
    );
    assert_eq!(result, ".a{color:red;&:hover{color:blue};background:white}");
}

#[test]
fn 字符串中的花括号不影响声明块定位() {
    let result = rewrite_css(
        r#".a{content:"{x}";color:red}"#,
        &[rule(&[".a"], "background:white", "append")],
    );
    assert_eq!(result, r#".a{content:"{x}";color:red;background:white}"#);
}

#[test]
fn 字面量不存在时按正则匹配() {
    let result = rewrite_css(
        ".a{padding:12px}",
        &[rule(&[r":\s*\d+px"], ":0", "replace")],
    );
    assert_eq!(result, ".a{padding:0}");
}

#[test]
fn 多条规则按数组顺序叠加() {
    let rules = [
        rule(&[".btn"], "color:blue", "replace"),
        rule(&["color:blue"], ";padding:0", "append"),
    ];
    assert_eq!(
        rewrite_css(".btn{color:red}", &rules),
        ".btn{color:blue;padding:0}"
    );
}

#[test]
fn 未命中时保留原始排版() {
    let code = ".a {\n  color: red;\n}\n";
    assert_eq!(
        rewrite_css(code, &[rule(&[".missing"], "x", "replace")]),
        code
    );
}

#[test]
fn 多个命中位置逐一处理() {
    let result = rewrite_css(
        ".a{color:red}.b{color:red}",
        &[rule(&["color:red"], "color:blue", "replace")],
    );
    assert_eq!(result, ".a{color:blue}.b{color:blue}");
}

#[test]
fn 字面量不匹配更长的标识符片段() {
    let code = ".btn-link{color:red}";
    assert_eq!(rewrite_css(code, &[rule(&[".btn"], "x", "replace")]), code);
    let code = ".a{background-color:red}";
    assert_eq!(
        rewrite_css(code, &[rule(&["color:red"], "blue", "replace")]),
        code
    );
}

#[test]
fn 伪类选择器按选择器处理() {
    let result = rewrite_css(
        ".btn:hover{color:red}",
        &[rule(&[".btn:hover"], "color:blue", "replace")],
    );
    assert_eq!(result, ".btn:hover{color:blue}");
}

#[test]
fn 声明片段不会被误判为选择器() {
    let result = rewrite_css(
        ".a{color:red}",
        &[rule(&["color:red"], "color:blue", "replace")],
    );
    assert_eq!(result, ".a{color:blue}");
}
