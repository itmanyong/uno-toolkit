# @uno-pc/jsx-directive

React JSX 条件指令与显示控制的编译期转换插件。

## 功能说明

插件使用 Rust 与 tree-sitter 在构建期改写 JSX/TSX，把指令转换为等价的 JavaScript 条件表达式与样式属性，运行时不引入额外依赖。

| 能力                            | 说明                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `v-if` / `v-else-if` / `v-else` | 同一层级的相邻 JSX 兄弟节点组成条件链，转换为条件渲染。                                                                      |
| `v-show`                        | 保留元素，按条件写入样式属性（默认 `display`），不卸载节点。                                                                 |
| 构建工具入口                    | 导出 `JsxDirectiveVite` 与 `JsxDirectiveRsbuild`。                                                                           |
| 核心 API                        | 包根入口还导出 `transformDirectives`、`getFormats`、`reportWarnings`，以及 `DirectiveTransformConfig` 等类型，便于自行集成。 |
| 转换时机                        | Vite 插件 `enforce: "pre"`，Rsbuild 插件 `order: "pre"`，均在其它代码转换之前执行。                                          |
| 默认处理范围                    | `.jsx`、`.tsx`，匹配不区分大小写。                                                                                           |
| 诊断                            | 无法转换的孤立分支等情形会通过构建工具 logger 输出警告。                                                                     |

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
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [pluginReact(), JsxDirectiveRsbuild({ prefix: "v-" })],
  };
});
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { JsxDirectiveVite } from "@uno-pc/jsx-directive/vite";

export default defineConfig({
  plugins: [JsxDirectiveVite()],
});
```

### 配置项

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
| `prefix`         | `"v-"`           | 指令名前缀。                                           |
| `formats`        | `["jsx", "tsx"]` | 处理的扩展名，可带或不带开头的点。                     |
| `ifFallback`     | `"null"`         | 条件链缺少 `v-else` 时使用的 JavaScript 表达式字符串。 |
| `show.property`  | `"display"`      | `v-show` 写入的样式属性名。                            |
| `show.whenTrue`  | `"undefined"`    | 条件为真时写入的 JavaScript 表达式字符串。             |
| `show.whenFalse` | `"'none'"`       | 条件为假时写入的 JavaScript 表达式字符串。             |

:::warning
`ifFallback`、`show.whenTrue`、`show.whenFalse` 会作为 JavaScript 表达式插入生成代码，不会被序列化为普通值。写字符串值时需要自带引号，例如 `"'none'"`。
:::

### TypeScript JSX 类型

包提供 React JSX 指令属性声明。在应用的 `tsconfig.json` 中加入包名，同时保留已有类型包：

```json
{
  "compilerOptions": {
    "types": ["rstack/types", "node", "@uno-pc/jsx-directive"]
  }
}
```

## 完整使用示例

以下代码来自可运行示例 [`examples/jsx-directive-all`](/guide/examples)，覆盖条件链、`v-show`、已有 `style` 的合并，以及通过按钮切换状态观察效果。

### 构建配置 `rstack.config.ts`

```ts
import { define } from "rstack";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      pluginReact(),
      JsxDirectiveRsbuild({
        prefix: "v-",
        formats: ["jsx", "tsx"],
        ifFallback: "null",
        show: {
          property: "display",
          whenTrue: "undefined",
          whenFalse: "'none'",
        },
      }),
    ],
  };
});
```

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
import { useState } from "react";
import "./App.css";

type ViewState = "ready" | "loading" | "idle";

export default function App() {
  const [state, setState] = useState<ViewState>("idle");
  const [visible, setVisible] = useState(true);

  return (
    <main className="content">
      <h1>JSX 指令示例</h1>

      <div className="toolbar">
        <button onClick={() => setState("ready")}>ready</button>
        <button onClick={() => setState("loading")}>loading</button>
        <button onClick={() => setState("idle")}>idle</button>
        <button onClick={() => setVisible((value) => !value)}>
          切换 v-show
        </button>
      </div>

      {/* 条件链分支之间允许存在换行与缩进（兼容 Prettier 等代码格式化），
          仅非空白文本、逗号或其他节点会中断链条。 */}
      <section className="panel">
        <p v-if={state === "ready"}>已就绪</p>
        <p v-else-if={state === "loading"}>加载中</p>
        <p v-else>暂不可用</p>
      </section>

      <section className="panel">
        <div v-show={visible}>v-show 保留元素，只切换 display</div>
        <div style={{ color: "#8ab4f8" }} v-show={visible}>
          已有 style 表达式会先展开，再合并 v-show 的属性
        </div>
      </section>
    </main>
  );
}
```

### 运行与观察

```sh
cd examples/jsx-directive-all
pnpm dev
```

切换 `ready` / `loading` / `idle`，页面只渲染条件链中的对应分支；切换 `v-show`，元素保留在 DOM 中，DevTools 中内联 `display` 在 `none` 与缺省之间变化，带 `style` 的元素仍保留 `color`。执行 `pnpm build` 后在 JS 产物中检索不到 `v-if` 等指令名，说明转换发生在构建期。

## 转换约束

- 条件必须是 JSX 表达式语法，例如 `v-if={ready}`。
- 条件链由**同一层级**的 JSX 兄弟节点组成。分支之间可以有 JSX 注释，也可以有空格、换行或缩进（与 Prettier 等代码格式化工具兼容）；仅**非空白文本、逗号或其他节点**会中断链条。违反此约束时，`v-else-if` / `v-else` 会成为孤立分支，构建日志会输出警告且不会被转换。

```tsx
// 正确：分支之间没有任何字符
<div v-if={ready}>A</div><div v-else-if={loading}>B</div><div v-else>C</div>

// 正确：紧邻的 JSX 注释
<div v-if={ready}>A</div>{/* 分支说明 */}<div v-else>B</div>

// 正确：分支之间可以换行与缩进（兼容代码格式化）
<div v-if={ready}>A</div>
<div v-else-if={loading}>B</div>
<div v-else>C</div>

// 错误：分支之间有非空白文本，会中断链条
<div v-if={ready}>A</div>中间文本<div v-else>B</div>
```

- 没有最终 `v-else` 的条件链使用 `ifFallback`。
- `v-show` 保留元素：没有 `style` 时创建样式对象；已有表达式形式的 `style` 会先展开再合并。若 `style` 不是表达式形式，则产生警告且不更新该样式值。

## 可运行示例

完整项目见[可运行示例](/guide/examples)中的 `examples/jsx-directive-all`，可直接启动并查看构建产物中的转换结果。
