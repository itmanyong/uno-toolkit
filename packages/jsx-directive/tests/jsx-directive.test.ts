import { expect, test } from "rstack/test";
import { getFormats, transformDirectives } from "../src/core";

test("扩展名使用规范化后的 JSX 默认格式", () => {
  expect(getFormats()).toEqual(["jsx", "tsx"]);
  expect(getFormats({ formats: [".TSX", "jsx"] })).toEqual(["tsx", "jsx"]);
});

test("按配置的 display 样式转换 v-show", () => {
  const result = transformDirectives(
    "<div v-show={visible} />",
    "component.tsx",
  );

  expect(result.code).toBe(
    "<div style={{[\"display\"]: (visible) ? (undefined) : ('none')}} />",
  );
  expect(result.warnings).toEqual([]);
});

test("不支持的文件格式保持源码不变", () => {
  const code = "<div v-show={visible} />";

  expect(transformDirectives(code, "component.vue")).toEqual({
    code,
    warnings: [],
  });
});

test("自定义格式、前缀、条件兜底和显示样式通过公开入口生效", () => {
  const options = {
    formats: [".JSX"],
    prefix: "x-",
    ifFallback: "<Empty />",
    show: {
      property: "visibility",
      whenTrue: "'visible'",
      whenFalse: "'hidden'",
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

test("v-html 与 v-text 替换原有子节点", () => {
  const html = transformDirectives(
    "<div v-html={markup}><span>old</span></div>",
    "component.tsx",
  );
  const text = transformDirectives(
    "<div v-text={message}>old</div>",
    "component.tsx",
  );

  expect(html).toEqual({
    code: "<div dangerouslySetInnerHTML={{ __html: markup }}></div>",
    warnings: [],
  });
  expect(text).toEqual({ code: "<div >{message}</div>", warnings: [] });
});

test("v-for 展开列表并保留循环变量与嵌套元素", () => {
  const result = transformDirectives(
    "<ul><li v-for={(item, index) in items} key={index}><b>{item.name}</b></li></ul>",
    "component.tsx",
  );

  expect(result.code).toContain("items).map((item, index)");
  expect(result.code).toContain("key={index}><b>{item.name}</b>");
  expect(result.code).not.toContain("v-for");
  expect(result.warnings).toEqual([]);
});

test("v-bind 支持对象展开、命名属性与简写", () => {
  const result = transformDirectives(
    "<div v-bind:title={title} :id={elementId} v-bind={props} />",
    "component.tsx",
  );

  expect(result).toEqual({
    code: "<div title={title} id={elementId} {...(props)} />",
    warnings: [],
  });
});

test("v-model 为原生输入和自定义组件生成绑定与更新回调", () => {
  const input = transformDirectives(
    '<input type="checkbox" value={option} v-model={choices} />',
    "component.tsx",
  );
  const component = transformDirectives(
    "<Field v-model:first={[name, update]} />",
    "component.tsx",
  );

  expect(input.code).toContain("checked={(choices).includes(option)}");
  expect(input.code).toContain(
    "onChange={event => (setChoices)(event.currentTarget.checked",
  );
  expect(input.code).not.toContain("v-model");
  expect(component.code).toContain(
    "first={name} onUpdateFirst={value => (update)(value)}",
  );
  expect(component.code).not.toContain("v-model");
  expect(input.warnings).toEqual([]);
  expect(component.warnings).toEqual([]);
});

test("冲突的内容指令保留原文并提供源码范围", () => {
  const source = "<div v-html={markup} v-text={message}>old</div>";
  const result = transformDirectives(source, "component.tsx");

  expect(result.code).toBe(source);
  expect(result.warnings).toEqual([
    {
      message: "v-html and v-text cannot be used together",
      start: 0,
      end: Buffer.byteLength(source.slice(0, source.indexOf(">") + 1)),
    },
  ]);
});

test("不合法的绑定和模型保留原文并报告指令位置", () => {
  for (const [source, directive, message] of [
    [
      '<div v-bind:title="literal" />',
      'v-bind:title="literal"',
      "must use JSX expression syntax",
    ],
    [
      "<input value={name} v-model={name} />",
      "v-model={name}",
      "conflicts with an existing value",
    ],
    [
      '<li v-for="item in items" />',
      'v-for="item in items"',
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
    "<><A v-if={first} />\n  <B v-else-if={second} />\n  <C v-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("(second) ? (<B />)");
  expect(result.code).toContain("(<C />)");
  expect(result.code).not.toContain("v-else");
  expect(result.warnings).toEqual([]);
});

test("分支周围的空白与注释不中断条件链", () => {
  const result = transformDirectives(
    "<><A v-if={first} /> {/* keep */}<B v-else /></>",
    "component.tsx",
  );

  expect(result.code).toContain("(first) ? (<A />)");
  expect(result.code).toContain("/* keep */");
  expect(result.code).toContain("<B />");
  expect(result.code).not.toContain("v-else");
  expect(result.warnings).toEqual([]);
});
