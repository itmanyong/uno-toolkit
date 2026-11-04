# @uno-pc/jsx-directive

使用 Rust 与 tree-sitter 在构建期转换 React JSX/TSX 指令，包括 `v-if` / `v-else-if` / `v-else`、`v-show`、`v-html`、`v-text`、`v-for`、`v-bind` 和 `v-model`，并提供 Vite、Rsbuild 插件。

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
import { JsxDirectiveVite } from "@uno-pc/jsx-directive/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [JsxDirectiveVite()],
});
```

### Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

export default defineConfig({
  plugins: [JsxDirectiveRsbuild({ prefix: "v-" })],
});
```

插件默认处理 `.jsx` 和 `.tsx` 文件，并在其他代码转换之前运行。

## 配置

```ts
JsxDirectiveVite({
  prefix: "v-",
  formats: ["jsx", "tsx"],
  ifFallback: "null",
  show: {
    property: "display",
    whenTrue: "undefined",
    whenFalse: "'none'",
  },
});
```

| 配置项           | 默认值           | 说明                                                   |
| ---------------- | ---------------- | ------------------------------------------------------ |
| `prefix`         | `'v-'`           | 指令名前缀。                                           |
| `formats`        | `['jsx', 'tsx']` | 处理的扩展名，可带或不带开头的点，匹配不区分大小写。   |
| `ifFallback`     | `'null'`         | 条件链没有 `v-else` 时使用的 JavaScript 表达式字符串。 |
| `show.property`  | `'display'`      | `v-show` 写入的样式属性名。                            |
| `show.whenTrue`  | `'undefined'`    | 条件为真时写入的 JavaScript 表达式字符串。             |
| `show.whenFalse` | `"'none'"`       | 条件为假时写入的 JavaScript 表达式字符串。             |

`ifFallback`、`show.whenTrue` 和 `show.whenFalse` 会作为 JavaScript 表达式插入生成代码，不会被序列化为普通值。

## 指令用法

### 条件分支

```tsx
<>
  <div v-if={ready}>已就绪</div>
  {/* 分支之间可以有 JSX 注释 */}
  <div v-else-if={loading}>加载中</div>
  <div v-else>暂不可用</div>
</>
```

`v-if` 和 `v-else-if` 的条件必须使用 JSX 表达式语法，例如 `v-if={ready}`。指令仅在同一层级的 JSX 兄弟节点中组成条件链。分支之间可以有 JSX 注释，也可以有空格、换行或缩进（与代码格式化工具兼容）；文本、逗号或其他非空白节点会中断链条。

没有最终 `v-else` 的条件链会使用 `ifFallback`。孤立的 `v-else-if` 或 `v-else` 不会转换，并会通过构建工具报告警告。

### 显示控制

```tsx
<div v-show={visible}>内容</div>
<div style={{ color: "red" }} v-show={visible}>带样式的内容</div>
```

`v-show` 保留元素，并根据条件设置 `show.property`。没有 `style` 时会创建样式对象；已有的表达式样式会先展开，再应用 `v-show` 对应的属性和值。若已有 `style` 不是表达式形式，会产生警告且不更新该样式值。

### 内容、列表与属性绑定

```tsx
<div v-html={html} />
<div v-text={message}>旧内容会被替换</div>
<ul>
  <li v-for={item in items} key={item}>{item}</li>
</ul>
<div v-bind={attrs} />
<img v-bind:src={url} v-bind:alt={alt} />
```

`v-html` 接收 JSX 表达式并生成 `dangerouslySetInnerHTML`；`v-text` 替换元素的全部子内容。两者不能用于同一元素，冲突时保留源码并报告警告。

`v-for` 使用 JSX 表达式形式 `v-for={item in items}` 或 `v-for={(item, index) in items}`，转换为 `items.map(...)`；与 `v-if` 同用时先编译条件，再展开循环。

`v-bind={attrs}` 会展开对象；`v-bind:name={expression}` 与 `:name={expression}` 使用 JSX 表达式作为绑定值。

### 双向绑定

```tsx
<input v-model={keyword} />
<input type="checkbox" value="Jack" v-model={checkedNames} />
<select multiple v-model={selectedList} />
<MyInput v-model={email} />
<UserName v-model:first={firstName} />
<textarea v-model={[keyword, setKeyword]} />
<UserName v-model:first={[firstName, setFirstName]} />
```

`v-model` 参考 Vue 3 的绑定约定（暂不支持修饰符）。原生 `input`、`textarea`、`select` 生成受控值及 `onChange`；checkbox/radio 根据类型生成 checked 状态，多选列表使用数组增删；自定义组件使用 `modelValue`/`onUpdateModelValue`，命名模型使用对应属性和 `onUpdate<Name>` 事件。

普通变量模型（例如 `v-model={keyword}`）默认推断 setter 为 `setKeyword`；也可写成 `[value, setter]` 显式指定。

## TypeScript JSX 类型

包提供 React JSX 指令属性声明，允许 `v-if`、`v-for`、`v-model`、`v-bind:name`、`v-model:name` 等指令值使用 JSX 表达式。应用的 `tsconfig.json` 可将包名加入 `compilerOptions.types`，同时保留已有类型包：

```json
{
  "compilerOptions": {
    "types": ["node", "@uno-pc/jsx-directive"]
  }
}
```

各属性由 `JsxDirectiveAttributes` 定义，`v-html` 的值类型沿用 React `dangerouslySetInnerHTML.__html`，`v-text` 沿用 `ReactNode`：

| 指令 | TypeScript 属性类型 | TSX 示例 |
| --- | --- | --- |
| `v-if` | `unknown` | `<p v-if={ready}>就绪</p>` |
| `v-else-if` | `unknown` | `<p v-else-if={loading}>加载中</p>` |
| `v-else` | `true` | `<p v-else>暂不可用</p>` |
| `v-show` | `unknown` | `<div v-show={visible}>内容</div>` |
| `v-html` | `NonNullable<DOMAttributes<HTMLElement>["dangerouslySetInnerHTML"]>["__html"]` | `<div v-html={html} />` |
| `v-text` | `ReactNode` | `<p v-text={message} />` |
| `v-for` | `boolean`（`item in items` 的静态结果） | `<li v-for={item in items}>{item}</li>` |
| `v-bind` | `object` | `<div v-bind={attrs} />` |
| `v-bind:名称` | `unknown` | `<img v-bind:src={url} />` |
| `:名称` | `unknown` | `<img :src={url} />`（仅转换器支持） |
| `v-model` | `unknown` | `<input v-model={keyword} />` |
| `v-model:名称` | `unknown` | `<UserName v-model:first={[firstName, setFirstName]} />` |

`unknown` 表示指令值不限制为布尔值或字符串；转换器仍要求动态值使用 `{...}`，`v-model` 只接受变量名或 `[value, setter]`。`v-else` 不接收条件，写成无值属性。

TypeScript 不会推导编译期作用域：`v-for` 的循环变量需在源码中提供占位声明，自定义组件的模型 props 需允许由编译器注入。双变量 `v-for={(item, index) in items}` 虽可转换，但 TypeScript 会报告 TS2695；`:name` 简写也无法通过 TSX 解析，源码中请用 `v-bind:name={value}`。`v-html` 会插入 HTML，仅传入可信内容。

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/jsx-directive build
pnpm --filter @uno-pc/jsx-directive test
pnpm --filter @uno-pc/jsx-directive typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。
