---
description: React JSX/TSX 编译期指令插件的安装、类型声明，以及条件、显示、列表、内容、属性和双向绑定指令的用法与可运行示例。
---

# @uno-pc/jsx-directive

React JSX / TSX 指令的编译期转换插件，支持条件、循环、内容、属性和双向绑定指令。

## 功能说明

插件使用 Rust 与 tree-sitter 在构建期改写 JSX/TSX，转换后不引入额外运行时依赖。

| 能力                            | 说明                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `x-if` / `x-else-if` / `x-else` | 同一层级的相邻 JSX 兄弟节点组成条件链，转换为条件渲染。                                         |
| `x-show`                        | 保留元素，按条件写入样式属性（默认 `display`），不卸载节点。                                    |
| `x-html` / `x-text`             | 分别注入 HTML 和替换元素文本内容。                                                              |
| `x-for`                         | 将数组转换为 `.map()` 列表；可与 `x-if` 同用。                                                  |
| `x-bind`                        | 支持对象展开、具名属性绑定。                                                                    |
| `x-model`                       | 支持原生表单控件和 Vue 3 风格自定义组件模型（暂不支持修饰符）。                                 |
| 构建工具入口                    | 导出 `JsxDirectivePluginVite` 与 `JsxDirectivePluginRsbuild`。                                  |
| 核心 API                        | 包根入口还导出 `transformDirectives`、`getFormats`、`reportWarnings` 及配置类型，便于自行集成。 |
| 转换时机                        | Vite 插件 `enforce: "pre"`；Rsbuild 插件使用默认 transform 档。                                 |
| 默认处理范围                    | `.jsx`、`.tsx`，匹配不区分大小写。                                                              |
| 诊断                            | 无效指令、冲突或孤立分支会通过构建工具 logger 输出警告。                                        |

## 安装与配置

### 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`

### 安装

```sh
pnpm add -D @uno-pc/jsx-directive
# npm 用户：npm install -D @uno-pc/jsx-directive
```

使用 JSX 指令必须注册插件，注册即启用转换；配置对象可以省略。

### 在 Rsbuild 中启用

```ts
// rstack.config.ts
import { define } from "rstack";
import { JsxDirectivePluginRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [pluginReact(), JsxDirectivePluginRsbuild()],
  };
});
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { JsxDirectivePluginVite } from "@uno-pc/jsx-directive/vite";

export default defineConfig({
  plugins: [JsxDirectivePluginVite()],
});
```

### 配置项

```ts
JsxDirectivePluginVite({
  prefix: "x-",
  formats: ["jsx", "tsx"],
  vIf: {
    notFallback: "null",
  },
  vShow: {
    property: "display",
    whenTrueValue: "undefined",
    whenFalseValue: "'none'",
  },
});
```

| 配置项                 | 默认值           | 说明                                                   |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| `prefix`               | `"x-"`           | 指令名前缀，支持字符串或字符串数组配置多个前缀。       |
| `formats`              | `["jsx", "tsx"]` | 处理的扩展名，可带或不带开头的点。                     |
| `vIf.notFallback`      | `"null"`         | 条件链缺少 `x-else` 时使用的 JavaScript 表达式字符串。 |
| `vShow.property`       | `"display"`      | `x-show` 写入的样式属性名。                            |
| `vShow.whenTrueValue`  | `"undefined"`    | 条件为真时写入的 JavaScript 表达式字符串。             |
| `vShow.whenFalseValue` | `"'none'"`       | 条件为假时写入的 JavaScript 表达式字符串。             |

:::warning
`vIf.notFallback`、`vShow.whenTrueValue`、`vShow.whenFalseValue` 会作为 JavaScript 表达式插入生成代码，不会被序列化为普通值。写字符串值时需要自带引号，例如 `"'none'"`。
:::

## 指令与 TypeScript 类型

包通过 React 模块增强提供 JSX 指令属性。在应用的 `tsconfig.json` 中加入包名，同时保留已有类型包：

```json
{
  "compilerOptions": {
    "types": ["rstack/types", "node", "@uno-pc/jsx-directive"]
  }
}
```

公开的 `JsxDirectiveAttributes` 与 JSX 增强使用相同的属性定义：

```ts
import type { DOMAttributes, ReactNode } from "react";

export interface JsxDirectiveAttributes {
  "x-if"?: unknown;
  "x-else-if"?: unknown;
  "x-else"?: true;
  "x-show"?: unknown;
  "x-html"?: NonNullable<
    DOMAttributes<HTMLElement>["dangerouslySetInnerHTML"]
  >["__html"];
  "x-text"?: ReactNode;
  "x-for"?: boolean;
  "x-bind"?: object;
  [attribute: `x-bind:${string}`]: unknown;
  "x-bind:name"?: unknown;
  "x-model"?: unknown;
  [attribute: `x-model:${string}`]: unknown;
  "x-model:name"?: unknown;
}
```

以下逐项给出类型和对应的 TSX 用法。`unknown` 表示属性类型允许任意表达式值，并不表示转换器接受任意语法；动态值仍需写成 `{...}`。

### `x-if`

类型：`"x-if"?: unknown`。按表达式的真值渲染当前元素；没有后续分支时使用 `vIf.notFallback`。

```tsx
<p x-if={state === "ready"}>已就绪</p>
```

### `x-else-if`

类型：`"x-else-if"?: unknown`。必须紧跟同层级的 `x-if` 或 `x-else-if` 分支；允许分支之间有空白或 JSX 注释。

```tsx
<p x-if={state === "ready"}>已就绪</p>
<p x-else-if={state === "loading"}>加载中</p>
```

### `x-else`

类型：`"x-else"?: true`。写成无值属性，作为条件链的最后一个分支。

```tsx
<p x-if={ready}>已就绪</p>
<p x-else>暂不可用</p>
```

### `x-show`

类型：`"x-show"?: unknown`。元素始终保留，条件值用于切换样式；已有表达式形式的 `style` 会先展开再合并。

```tsx
<div style={{ color: "#8ab4f8" }} x-show={visible}>
  内容
</div>
```

### `x-html`

类型：`"x-html"?: NonNullable<DOMAttributes<HTMLElement>["dangerouslySetInnerHTML"]>["__html"]`，与 React 的 `dangerouslySetInnerHTML.__html` 一致。替换元素内容，只应传入可信 HTML。

```tsx
<div x-html={rawHtml} />
```

### `x-text`

类型：`"x-text"?: ReactNode`。替换原有子内容；不能和 `x-html` 用在同一个元素上。

```tsx
<p x-text={keyword}>原有内容会被替换</p>
```

### `x-for`

类型：`"x-for"?: boolean`，对应 TypeScript 对 `item in items` 的静态表达式结果；转换器实际把它解析为 `items.map((item) => ...)`。

```tsx
// 仅用于让源码通过 TypeScript 检查；转换后使用 map 回调中的 item。
const item = "";
const items = ["Alpha", "Beta", "Gamma"];

<ul>
  <li x-for={item in items} key={item}>
    {item}
  </li>
</ul>;
```

它也支持与 `x-if` 同用，以及 `x-for={(item, index) in items}` 双变量形式。后者虽然能转换，但 TypeScript 会对逗号表达式报告 TS2695，类型声明无法消除；需要无诊断的 TSX 示例时请使用单变量形式。

### `x-bind`

类型：`"x-bind"?: object`，把对象展开为 JSX 属性。

```tsx
<img x-bind={imageAttrs} />
```

具名绑定的类型是模板属性 ``[attribute: `x-bind:${string}`]: unknown``，例如：

```tsx
<img x-bind:src={imageAttrs.src} x-bind:alt={imageAttrs.alt} />
```

### `x-model`

类型：`"x-model"?: unknown`。转换器只接受变量名，或 `[value, setter]`；属性类型无法校验这个编译期约定。变量名形式按 `set${大驼峰变量名}` 查找 setter。

```tsx
<input x-model={keyword} />
<textarea x-model={[keyword, setKeyword]} />
<input type="checkbox" x-model={agreed} />
<input type="checkbox" value="Jack" x-model={checkedNames} />
<input type="radio" value="One" x-model={picked} />
<select x-model={selected}>...</select>
<select multiple x-model={selectedList}>...</select>
<ModelInput x-model={email} />
```

原生控件生成 `value` 或 `checked` 和 `onChange`；带 `value` 的 checkbox 对数组模型增删选项。自定义组件生成 `modelValue` 和 `onUpdateModelValue`。不支持修饰符；模型属性或更新处理函数与已有属性冲突时会保留原文并发出警告。

### `x-model:名称`

类型：``[attribute: `x-model:${string}`]: unknown``。仅适用于自定义组件，生成同名模型属性和 `onUpdate<Name>` 回调；组件声明中的模型属性和回调需设为可选，才能通过转换前的源码静态检查。

```tsx
<NamedModelInput x-model:first={[firstName, setFirstName]} />
```

## 完整使用示例

[`examples/jsx-directive-all`](/guide/examples) 是可运行的 React + Rsbuild 示例，下面的配置与组件代码对应当前项目。

### 构建配置 `rstack.config.ts`

```ts
import { define } from "rstack";
import { JsxDirectivePluginRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      JsxDirectivePluginRsbuild({
        prefix: "x-",
        formats: ["jsx", "tsx"],
        vIf: {
          notFallback: "null",
        },
        vShow: {
          property: "display",
          whenTrueValue: "undefined",
          whenFalseValue: "'none'",
        },
      }),
      pluginReact({
        reactCompiler: true,
      }),
    ],
    html: {
      tags: [
        {
          tag: "script",
          attrs: {
            crossOrigin: "anonymous",
            src: "//unpkg.com/react-scan/dist/auto.global.js",
          },
        },
      ],
    },
  };
});
```

`reactCompiler` 和 React Scan 脚本是该示例的额外配置；使用 JSX 指令只需注册 `JsxDirectivePluginRsbuild` 和 React 插件。

### `tsconfig.json` 关键项

```json
{
  "compilerOptions": {
    "types": ["rstack/types", "node", "@uno-pc/jsx-directive"]
  },
  "include": ["src"]
}
```

### `src/App.tsx`

```tsx
import { useState, Fragment } from "react";
import "./App.css";

type ViewState = "ready" | "loading" | "idle";

const ModelInput = ({
  modelValue,
  onUpdateModelValue,
}: {
  modelValue?: string;
  onUpdateModelValue?: (value: string) => void;
}) => (
  <input
    value={modelValue}
    onChange={(event) => onUpdateModelValue?.(event.target.value)}
  />
);

const NamedModelInput = ({
  first,
  onUpdateFirst,
}: {
  first?: string;
  onUpdateFirst?: (value: string) => void;
}) => (
  <input
    value={first}
    onChange={(event) => onUpdateFirst?.(event.target.value)}
  />
);

export default function App() {
  const [state, setState] = useState<ViewState>("idle");
  const [visible, setVisible] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [checkedNames, setCheckedNames] = useState<string[]>([]);
  const [picked, setPicked] = useState("One");
  const [selected, setSelected] = useState("a");
  const [selectedList, setSelectedList] = useState<string[]>(["a"]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  // 指令编译前，TypeScript 不会为 x-model 自动识别生成的 setter。
  void [
    setAgreed,
    setCheckedNames,
    setPicked,
    setSelected,
    setSelectedList,
    setEmail,
  ];

  const items = ["Alpha", "Beta", "Gamma"];
  // x-for 的局部变量由构建期生成的 map 回调提供；占位变量仅供源代码静态检查。
  const item = "";
  const imageAttrs = {
    src: "https://placehold.co/160x80",
    alt: "属性对象展开示例",
    width: 160,
  };
  const rawHtml = "<strong>x-html 注入的 HTML</strong>";

  return (
    <main className="content">
      <h1>JSX 指令示例</h1>

      <div className="toolbar">
        <button onClick={() => setState("ready")}>ready</button>
        <button onClick={() => setState("loading")}>loading</button>
        <button onClick={() => setState("idle")}>idle</button>
        <button onClick={() => setVisible((value) => !value)}>
          切换 x-show
        </button>
      </div>

      <VifElse state={state} />
      <VShow visible={visible} />

      <section className="panel">
        <h2>内容与列表</h2>
        <div x-html={rawHtml} />
        <p x-text={keyword}>这段初始内容会被 x-text 替换</p>
        <ul>
          <li x-for={item in items} key={item}>
            {item}
          </li>
        </ul>
        <ul>
          <li x-if={items.length > 0} x-for={item in items} key={item}>
            条件先判断，再循环：{item}
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>属性绑定</h2>
        <img x-bind={imageAttrs} />
        <img x-bind:src={imageAttrs.src} x-bind:alt={imageAttrs.alt} />
      </section>

      <section className="panel">
        <h2>x-model</h2>
        <label>
          文本：
          <input x-model={keyword} />
        </label>
        <label>
          显式 setter：
          <textarea x-model={[keyword, setKeyword]} />
        </label>
        <label>
          <input type="checkbox" x-model={agreed} /> 同意（布尔模型）
        </label>
        <label>
          <input type="checkbox" value="Jack" x-model={checkedNames} /> Jack
        </label>
        <label>
          <input type="checkbox" value="Mike" x-model={checkedNames} /> Mike
        </label>
        <p>已选：{checkedNames.join(", ") || "无"}</p>
        <label>
          <input type="radio" value="One" x-model={picked} /> One
        </label>
        <label>
          <input type="radio" value="Two" x-model={picked} /> Two
        </label>
        <p>单选：{picked}</p>
        <label>
          下拉单选：
          <select x-model={selected}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </label>
        <label>
          下拉多选：
          <select multiple x-model={selectedList}>
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
          </select>
        </label>
        <p>多选：{selectedList.join(", ")}</p>
        <label>
          组件输入：
          <ModelInput x-model={email} />
        </label>
        <p>组件模型：{email || "未填写"}</p>
        <label>
          具名输入：
          <NamedModelInput x-model:first={[firstName, setFirstName]} />
        </label>
        <p>具名模型：{firstName || "未填写"}</p>
      </section>
    </main>
  );
}

const VifElse = ({ state }: { state: ViewState }) => (
  <section className="panel">
    <p x-if={state === "ready"}>已就绪</p>
    <p x-else-if={state === "loading"}>加载中</p>
    <p x-else>暂不可用</p>
  </section>
);

const VShow = ({ visible }: { visible: boolean }) => (
  <section className="panel">
    <div x-show={visible}>x-show 保留元素，只切换 display</div>
    <div style={{ color: "#8ab4f8" }} x-show={visible}>
      <Fragment x-if={visible}>
        已有 style 表达式会先展开，再合并 x-show 的属性
      </Fragment>
    </div>
  </section>
);
```

### 运行与观察

```sh
cd examples/jsx-directive-all
pnpm dev
```

切换 `ready` / `loading` / `idle` 可以观察条件分支；切换 `x-show` 可观察元素保留在 DOM 中以及样式变化。其他控件可直接交互查看 x-model 更新，列表和属性绑定则展示编译期改写效果。执行 `pnpm build` 后在 JS 产物中检索不到指令名，说明转换发生在构建期。

## 转换约束

- 条件指令如 `x-if` / `x-show` 使用 JSX 表达式语法，例如 `x-if={ready}`；`x-html`、`x-text` 也接收 JSX 表达式。`x-html` 与 `x-text` 不能在同一元素上同时使用。
- `x-for` 使用 `x-for={item in items}` 或 `x-for={(item, index) in items}`；与 `x-if` 同时出现时先编译条件再编译循环。
- `x-bind={attrs}` 展开属性对象；`x-bind:name={expression}` 将 JSX 表达式作为绑定值。
- `x-model` 暂不支持修饰符。原生 `input`、`textarea`、`select` 和自定义组件按 Vue 3 约定生成更新处理；未提供 setter 时按 `set${大驼峰变量名}` 推断。
- 条件链由**同一层级**的 JSX 兄弟节点组成。分支之间可以有 JSX 注释，也可以有空格、换行或缩进（与 Prettier 等代码格式化工具兼容）；仅**非空白文本、逗号或其他节点**会中断链条。违反此约束时，`x-else-if` / `x-else` 会成为孤立分支，构建日志会输出警告且不会被转换。

```tsx
// 正确：分支之间没有任何字符
<div x-if={ready}>A</div><div x-else-if={loading}>B</div><div x-else>C</div>

// 正确：紧邻的 JSX 注释
<div x-if={ready}>A</div>{/* 分支说明 */}<div x-else>B</div>

// 正确：分支之间可以换行与缩进（兼容代码格式化）
<div x-if={ready}>A</div>
<div x-else-if={loading}>B</div>
<div x-else>C</div>

// 错误：分支之间有非空白文本，会中断链条
<div x-if={ready}>A</div>中间文本<div x-else>B</div>
```

- 没有最终 `x-else` 的条件链使用 `vIf.notFallback`。
- `x-show` 保留元素：没有 `style` 时创建样式对象；已有表达式形式的 `style` 会先展开再合并。若 `style` 不是表达式形式，则产生警告且不更新该样式值。

## 可运行示例

完整项目见[可运行示例](/guide/examples)中的 `examples/jsx-directive-all`，可直接启动并查看构建产物中的转换结果。
