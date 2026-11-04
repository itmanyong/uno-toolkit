# @uno-pc/jsx-directive

使用 Rust 与 tree-sitter 在构建期转换 React JSX/TSX 指令。提供 `v-if`、`v-else-if`、`v-else` 条件分支和 `v-show` 显示控制，并提供 Vite、Rsbuild 插件。

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

## TypeScript JSX 类型

包提供 React JSX 指令属性声明。应用的 `tsconfig.json` 可将包名加入 `compilerOptions.types`，同时保留已有类型包：

```json
{
  "compilerOptions": {
    "types": ["node", "@uno-pc/jsx-directive"]
  }
}
```

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/jsx-directive build
pnpm --filter @uno-pc/jsx-directive test
pnpm --filter @uno-pc/jsx-directive typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。
