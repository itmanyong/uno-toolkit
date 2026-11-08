import { expect, test } from "rstack/test";
import { getFormats, transformDirectives } from "../src/core";

test("扩展名使用规范化后的 JSX 默认格式", () => {
  expect(getFormats()).toEqual(["jsx", "tsx"]);
  expect(getFormats({ formats: [".TSX", "jsx"] })).toEqual(["tsx", "jsx"]);
});

test("按配置的 display 样式转换 x-show", () => {
  const result = transformDirectives(
    "<div x-show={visible} />",
    "component.tsx",
  );

  expect(result.code).toBe(
    "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
  );
  expect(result.warnings).toEqual([]);
});

test("不支持的文件格式保持源码不变", () => {
  const code = "<div x-show={visible} />";

  // 不支持的格式：提前返回，edits 为空
  expect(transformDirectives(code, "component.vue")).toEqual({
    code,
    warnings: [],
    edits: [],
  });
});

test("自定义格式、前缀、条件兜底和显示样式通过公开入口生效", () => {
  const options = {
    formats: [".JSX"],
    prefix: "x-",
    vIf: {
      notFallback: "<Empty />",
    },
    vShow: {
      property: "visibility",
      whenTrueValue: "'visible'",
      whenFalseValue: "'hidden'",
    },
  };
  const source = "<A x-if={ready} x-show={visible} />";
  const result = transformDirectives(source, "component.jsx", options);

  expect(result.code).toContain("(ready) ? (<A");
  expect(result.code).toContain(
    "style={{[\"visibility\"]: (visible) ? ('visible') : ('hidden')}}",
  );
  expect(result.code).toContain("(<Empty />)");
  expect(result.warnings).toEqual([]);
  expect(transformDirectives(source, "component.tsx", options).code).toBe(
    source,
  );
});

test("x-html 与 x-text 替换原有子节点", () => {
  const html = transformDirectives(
    "<div x-html={markup}><span>old</span></div>",
    "component.tsx",
  );
  const text = transformDirectives(
    "<div x-text={message}>old</div>",
    "component.tsx",
  );

  expect(html).toEqual({
    code: "<div dangerouslySetInnerHTML={{ __html: markup }}></div>",
    warnings: [],
    edits: expect.any(Array),
  });
  expect(text).toEqual({
    code: "<div >{message}</div>",
    warnings: [],
    edits: expect.any(Array),
  });
});

test("x-for 展开列表并保留循环变量与嵌套元素", () => {
  const result = transformDirectives(
    "<ul><li x-for={(item, index) in items} key={index}><b>{item.name}</b></li></ul>",
    "component.tsx",
  );

  expect(result.code).toContain("items).map((item, index)");
  expect(result.code).toContain("key={index}><b>{item.name}</b>");
  expect(result.code).not.toContain("x-for");
  expect(result.warnings).toEqual([]);
});

test("x-bind 支持对象展开与命名属性", () => {
  const result = transformDirectives(
    "<div x-bind:title={title} x-bind:id={elementId} x-bind={props} />",
    "component.tsx",
  );

  expect(result).toEqual({
    code: "<div title={title} id={elementId} {...(props)} />",
    warnings: [],
    edits: expect.any(Array),
  });
});

test("x-model 为原生输入和自定义组件生成绑定与更新回调", () => {
  const input = transformDirectives(
    '<input type="checkbox" value={option} x-model={choices} />',
    "component.tsx",
  );
  const component = transformDirectives(
    "<Field x-model:first={[name, update]} />",
    "component.tsx",
  );

  expect(input.code).toContain("checked={(choices).includes(option)}");
  expect(input.code).toContain(
    "onChange={event => (setChoices)(event.currentTarget.checked",
  );
  expect(input.code).not.toContain("x-model");
  expect(component.code).toContain(
    "first={name} onUpdateFirst={value => (update)(value)}",
  );
  expect(component.code).not.toContain("x-model");
  expect(input.warnings).toEqual([]);
  expect(component.warnings).toEqual([]);
});

test("冲突的内容指令保留原文并提供源码范围", () => {
  const source = "<div x-html={markup} x-text={message}>old</div>";
  const result = transformDirectives(source, "component.tsx");

  expect(result.code).toBe(source);
  expect(result.warnings).toEqual([
    {
      message: "x-html and x-text cannot be used together",
      start: 0,
      end: Buffer.byteLength(source.slice(0, source.indexOf(">") + 1)),
    },
  ]);
});

test("不合法的绑定和模型保留原文并报告指令位置", () => {
  for (const [source, directive, message] of [
    [
      '<div x-bind:title="literal" />',
      'x-bind:title="literal"',
      "must use JSX expression syntax",
    ],
    [
      "<input value={name} x-model={name} />",
      "x-model={name}",
      "conflicts with an existing value",
    ],
    [
      '<li x-for="item in items" />',
      'x-for="item in items"',
      "must use JSX expression syntax",
    ],
  ]) {
    const result = transformDirectives(source, "component.tsx");

    expect(result.code).toBe(source);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      message: expect.stringContaining(message),
      start: source.indexOf(directive),
      end: source.indexOf(directive) + directive.length,
    });
  }
});

test("分支之间的空格与换行不中断条件链", () => {
  const result = transformDirectives(
    "<><A x-if={first} />\n  <B x-else-if={second} />\n  <C x-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("(second) ? (<B />)");
  expect(result.code).toContain("(<C />)");
  expect(result.code).not.toContain("x-else");
  expect(result.warnings).toEqual([]);
});

test("分支周围的空白与注释不中断条件链", () => {
  const result = transformDirectives(
    "<><A x-if={first} /> {/* keep */}<B x-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("/* keep */");
  expect(result.code).toContain("<B />");
  expect(result.code).not.toContain("x-else");
  expect(result.warnings).toEqual([]);
});
