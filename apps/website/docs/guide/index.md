# 开始使用

Uno Toolkit 提供三个在**构建期**改写代码的插件。转换结果进入构建产物，业务源码保持简洁；除了 `@uno-pc/signals-transform` 需要应用自带 `@preact/signals-react` 运行时外，其余两个插件不向应用引入运行时依赖。

## 插件一览

| 插件包 | 作用 | 适用场景 | 使用文档 |
| --- | --- | --- | --- |
| `@uno-pc/jsx-directive` | 把 JSX 指令转换为条件表达式与样式属性 | React 项目中希望用指令写法表达条件渲染与显示控制 | [/plugins/jsx-directive](/plugins/jsx-directive) |
| `@uno-pc/style-layer` | 把 CSS 放入指定 `@layer`，并为 `@import` 注入 layer | 需要在构建期确定第三方样式与应用样式的层叠顺序 | [/plugins/style-layer](/plugins/style-layer) |
| `@uno-pc/signals-transform` | 自动注入 `useSignals` 并用 `try/finally` 收尾跟踪 | 使用 Preact Signals React，希望省去手写跟踪样板代码 | [/plugins/signals-transform](/plugins/signals-transform) |

每个插件同时提供 Vite 与 Rsbuild 两种入口，通过包名的 `/vite` 与 `/rsbuild` 子路径导入。

## 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 使用 `@uno-pc/signals-transform` 的应用还需安装 `@preact/signals-react`
- 使用已发布的二进制包不需要 Rust 与 Cargo；仅从源码编译插件的原生扩展时需要

## 安装与启用

三个插件都作为开发依赖安装，**注册插件即启用转换**，配置对象可以省略。以 `@uno-pc/jsx-directive` 为例：

```sh
pnpm add -D @uno-pc/jsx-directive
# npm 用户：npm install -D @uno-pc/jsx-directive
```

在 Rsbuild 项目中注册：

```ts
// rstack.config.ts
import { define } from "rstack";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [pluginReact(), JsxDirectiveRsbuild()],
  };
});
```

在 Vite 项目中注册：

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { JsxDirectiveVite } from "@uno-pc/jsx-directive/vite";

export default defineConfig({
  plugins: [JsxDirectiveVite()],
});
```

其余两个插件的注册方式相同，具体参数见各插件文档的「安装与配置」。

## 文档地图

- 三份插件文档：功能说明、安装与配置、完整使用示例、转换约束。
- [可运行示例](/guide/examples)：三个示例项目的运行方式、演示内容与产物检查方法。

## 运行示例项目

仓库的 `examples/` 目录为三个插件各提供了一个可独立运行的示例项目：

```sh
# 在仓库根目录安装依赖
pnpm install

# 启动任一示例，默认访问 http://localhost:3000
cd examples/jsx-directive-all
pnpm dev

# 生产构建，产物位于该示例的 dist 目录
pnpm build
```

## 排查插件未生效

1. 确认插件已注册到构建配置，且使用与目标构建工具匹配的入口（`/rsbuild` 或 `/vite`）。
2. 确认目标文件的扩展名在插件的 `formats` 处理范围内。
3. 确认指令名称与配置的 `prefix` 一致；条件链、样式匹配等也有各自的边界条件，见对应插件文档。
4. 构建日志中的警告会指出无法转换的位置，例如孤立的条件分支或未采用表达式形式的 `style`。
