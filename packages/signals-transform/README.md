# @uno-pc/signals-transform

为 Preact Signals React 提供 Rust 驱动的编译期转换。转换器可为符合条件的函数组件或自定义 Hook 注入 `useSignals` 调用，并使用 `try/finally` 确保跟踪在函数退出时结束。

- 📖 在线文档：<https://itmanyong.github.io/uno-toolkit/plugins/signals-transform>

## 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 从源码编译原生扩展需要 Rust 和 Cargo
- 启用转换的应用需安装 `@preact/signals-react`

## 安装

```sh
pnpm add -D @uno-pc/signals-transform
pnpm add @preact/signals-react
```

注册插件即启用转换；可以不传配置，也可以传入配置对象调整行为。

### Vite

```ts
import { SignalsTransformVite } from "@uno-pc/signals-transform/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    SignalsTransformVite({
      mode: "auto",
      importSource: "@preact/signals-react/runtime",
    }),
  ],
});
```

### Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { SignalsTransformRsbuild } from "@uno-pc/signals-transform/rsbuild";

export default defineConfig({
  plugins: [SignalsTransformRsbuild()],
});
```

插件默认处理 `.js`、`.jsx`、`.ts` 和 `.tsx` 文件，并在其他代码转换之前运行。

## 配置

| 配置项                 | 默认值                            | 说明                                                                                                       |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `mode`                 | `'auto'`                          | `'auto'` 自动检测信号访问；`'manual'` 仅转换带 `@useSignals` 标记的函数；`'all'` 转换所有包含 JSX 的组件。 |
| `importSource`         | `'@preact/signals-react/runtime'` | `useSignals` Hook 的导入模块。                                                                             |
| `detectTransformedJSX` | `false`                           | 同时识别 `jsx`、`jsxs`、`jsxDEV` 和 `createElement` 等已编译 JSX 调用。                                    |
| `formats`              | `['js', 'jsx', 'ts', 'tsx']`      | 处理的扩展名，可带或不带开头的点。                                                                         |

## 转换规则

- `auto` 模式下，函数组件需以大写字母开头、包含 JSX，并访问信号的 `.value`；自定义 Hook 需符合 `useXxx` 命名形式。
- 可通过 `@useSignals` 注释显式启用函数；`@noUseSignals` 用于排除。
- `@noUseSignals` 优先于 `@useSignals`。
- 当函数体内存在符合规则的信号访问时，转换会自动导入配置的运行时 Hook。
- `manual` 模式下，没有 `@useSignals` 标记的函数不会转换；`all` 模式会转换包含 JSX 的组件，即使未检测到信号访问。

```tsx
/** @useSignals */
function Counter() {
  return <p>{count.value}</p>;
}
```

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/signals-transform build
pnpm --filter @uno-pc/signals-transform test
pnpm --filter @uno-pc/signals-transform typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。
