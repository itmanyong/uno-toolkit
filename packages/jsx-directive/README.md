# @uno-pc/jsx-directive

使用 Rust 与 tree-sitter 在构建期转换 React JSX/TSX 指令，包括 `x-if` / `x-else-if` / `x-else`、`x-show`、`x-html`、`x-text`、`x-for`、`x-bind` 和 `x-model`，并提供 Vite、Rsbuild 插件。

- 📖 在线文档：<https://itmanyong.github.io/uno-toolkit/plugins/jsx-directive>

## 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 从源码编译原生扩展需要 Rust 和 Cargo

## 安装

```sh
pnpm add -D @uno-pc/jsx-directive
```

使用 JSX 指令需要配置插件。注册插件即启用转换；可以不传配置，也可以传入配置对象调整行为。

### Vite

```ts
import { JsxDirectivePluginVite } from "@uno-pc/jsx-directive/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [JsxDirectivePluginVite()],
});
```

### Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { JsxDirectivePluginRsbuild } from "@uno-pc/jsx-directive/rsbuild";

export default defineConfig({
  plugins: [JsxDirectivePluginRsbuild()],
});
```

插件默认处理 `.jsx` 和 `.tsx` 文件，并在其他代码转换之前运行。

## 配置

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
| `prefix`               | `'x-'`           | 指令名前缀，支持字符串或字符串数组配置多个前缀。       |
| `formats`              | `['jsx', 'tsx']` | 处理的扩展名，可带或不带开头的点，匹配不区分大小写。   |
| `vIf.notFallback`      | `'null'`         | 条件链没有 `x-else` 时使用的 JavaScript 表达式字符串。 |
| `vShow.property`       | `'display'`      | `x-show` 写入的样式属性名。                            |
| `vShow.whenTrueValue`  | `'undefined'`    | 条件为真时写入的 JavaScript 表达式字符串。             |
| `vShow.whenFalseValue` | `"'none'"`       | 条件为假时写入的 JavaScript 表达式字符串。             |

`vIf.notFallback`、`vShow.whenTrueValue` 和 `vShow.whenFalseValue` 会作为 JavaScript 表达式插入生成代码，不会被序列化为普通值。

## 指令用法

### 条件分支

```tsx
<>
  <div x-if={ready}>已就绪</div>
  {/* 分支之间可以有 JSX 注释 */}
  <div x-else-if={loading}>加载中</div>
  <div x-else>暂不可用</div>
</>
```

`x-if` 和 `x-else-if` 的条件必须使用 JSX 表达式语法，例如 `x-if={ready}`。指令仅在同一层级的 JSX 兄弟节点中组成条件链。分支之间可以有 JSX 注释，也可以有空格、换行或缩进（与代码格式化工具兼容）；文本、逗号或其他非空白节点会中断链条。

没有最终 `x-else` 的条件链会使用 `vIf.notFallback`。孤立的 `x-else-if` 或 `x-else` 不会转换，并会通过构建工具报告警告。

### 显示控制

```tsx
<div x-show={visible}>内容</div>
<div style={{ color: "red" }} x-show={visible}>带样式的内容</div>
```

`x-show` 保留元素，并根据条件设置 `vShow.property`。没有 `style` 时会创建样式对象；已有的表达式样式会先展开，再应用 `x-show` 对应的属性和值。若已有 `style` 不是表达式形式，会产生警告且不更新该样式值。

### 内容、列表与属性绑定

```tsx
<div x-html={html} />
<div x-text={message}>旧内容会被替换</div>
<ul>
  <li x-for={item in items} key={item}>{item}</li>
</ul>
<div x-bind={attrs} />
<img x-bind:src={url} x-bind:alt={alt} />
```

`x-html` 接收 JSX 表达式并生成 `dangerouslySetInnerHTML`；`x-text` 替换元素的全部子内容。两者不能用于同一元素，冲突时保留源码并报告警告。

`x-for` 使用 JSX 表达式形式 `x-for={item in items}` 或 `x-for={(item, index) in items}`，转换为 `items.map(...)`；与 `x-if` 同用时先编译条件，再展开循环。

`x-bind={attrs}` 会展开对象；`x-bind:name={expression}` 使用 JSX 表达式作为绑定值。

### 双向绑定

```tsx
<input x-model={keyword} />
<input type="checkbox" value="Jack" x-model={checkedNames} />
<select multiple x-model={selectedList} />
<MyInput x-model={email} />
<UserName x-model:first={firstName} />
<textarea x-model={[keyword, setKeyword]} />
<UserName x-model:first={[firstName, setFirstName]} />
```

`x-model` 参考 Vue 3 的绑定约定（暂不支持修饰符）。原生 `input`、`textarea`、`select` 生成受控值及 `onChange`；checkbox/radio 根据类型生成 checked 状态，多选列表使用数组增删；自定义组件使用 `modelValue`/`onUpdateModelValue`，命名模型使用对应属性和 `onUpdate<Name>` 事件。

普通变量模型（例如 `x-model={keyword}`）默认推断 setter 为 `setKeyword`；也可写成 `[value, setter]` 显式指定。

## TypeScript JSX 类型

包提供 React JSX 指令属性声明，允许 `x-if`、`x-for`、`x-model`、`x-bind:name`、`x-model:name` 等指令值使用 JSX 表达式。应用的 `tsconfig.json` 可将包名加入 `compilerOptions.types`，同时保留已有类型包：

```json
{
  "compilerOptions": {
    "types": ["node", "@uno-pc/jsx-directive"]
  }
}
```

各属性由 `JsxDirectiveAttributes` 定义，`x-html` 的值类型沿用 React `dangerouslySetInnerHTML.__html`，`x-text` 沿用 `ReactNode`：

| 指令           | TypeScript 属性类型                                                            | TSX 示例                                                 |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `x-if`         | `unknown`                                                                      | `<p x-if={ready}>就绪</p>`                               |
| `x-else-if`    | `unknown`                                                                      | `<p x-else-if={loading}>加载中</p>`                      |
| `x-else`       | `true`                                                                         | `<p x-else>暂不可用</p>`                                 |
| `x-show`       | `unknown`                                                                      | `<div x-show={visible}>内容</div>`                       |
| `x-html`       | `NonNullable<DOMAttributes<HTMLElement>["dangerouslySetInnerHTML"]>["__html"]` | `<div x-html={html} />`                                  |
| `x-text`       | `ReactNode`                                                                    | `<p x-text={message} />`                                 |
| `x-for`        | `boolean`（`item in items` 的静态结果）                                        | `<li x-for={item in items}>{item}</li>`                  |
| `x-bind`       | `object`                                                                       | `<div x-bind={attrs} />`                                 |
| `x-bind:名称`  | `unknown`                                                                      | `<img x-bind:src={url} />`                               |
| `x-model`      | `unknown`                                                                      | `<input x-model={keyword} />`                            |
| `x-model:名称` | `unknown`                                                                      | `<UserName x-model:first={[firstName, setFirstName]} />` |

`unknown` 表示指令值不限制为布尔值或字符串；转换器仍要求动态值使用 `{...}`，`x-model` 只接受变量名或 `[value, setter]`。`x-else` 不接收条件，写成无值属性。

TypeScript 不会推导编译期作用域：`x-for` 的循环变量需在源码中提供占位声明，自定义组件的模型 props 需允许由编译器注入。双变量 `x-for={(item, index) in items}` 虽可转换，但 TypeScript 会报告 TS2695。`x-html` 会插入 HTML，仅传入可信内容。

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/jsx-directive build
pnpm --filter @uno-pc/jsx-directive test
pnpm --filter @uno-pc/jsx-directive typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。
