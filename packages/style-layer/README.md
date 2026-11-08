# @uno-pc/style-layer

使用 Rust 在构建期将 CSS 文件放入指定的 CSS Cascade Layer，并可为命中的 CSS `@import` 添加 `layer(name)`。提供 Vite 和 Rsbuild 插件。

- 📖 在线文档：<https://itmanyong.github.io/uno-toolkit/plugins/style-layer>

## 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 从源码编译原生扩展需要 Rust 和 Cargo

## 安装

```sh
pnpm add -D @uno-pc/style-layer
```

注册插件即启用转换；可以不传配置，也可以传入配置对象调整行为。

### Vite

```ts
import { StyleLayerPluginVite } from "@uno-pc/style-layer/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    StyleLayerPluginVite({
      exclude: [],
      configs: [
        {
          include: "**/node_modules/@radix-ui/**/*.css",
          layerName: "vendor.radix",
        },
        { include: "**/node_modules/**/*.css", layerName: "vendor" },
        { include: "**/src/**/*.css", layerName: "application" },
      ],
    }),
  ],
});
```

### Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { StyleLayerPluginRsbuild } from "@uno-pc/style-layer/rsbuild";

export default defineConfig({
  plugins: [
    StyleLayerPluginRsbuild({
      include: "**/src/**/*.css",
      layerName: "application",
    }),
  ],
});
```

## 配置

| 配置项              | 默认值                           | 说明                                                         |
| ------------------- | -------------------------------- | ------------------------------------------------------------ |
| `include`           | `/\.css$/i`                      | 需要处理的文件路径模式。                                     |
| `exclude`           | `/node_modules/`                 | 排除的文件路径模式。                                         |
| `layerName`         | `'default'`                      | CSS layer 名称，也可以是根据文件上下文返回名称的函数。       |
| `configs`           | `[]`                             | 按顺序匹配的规则列表；每条规则可单独设置匹配条件和转换参数。 |
| `skipIfLayerExists` | `true`                           | CSS 已包含命名 `@layer` 规则时不再包裹。                     |
| `importLayer`       | `true`                           | 为命中的、尚未指定 layer 的 `@import` 添加 `layer(name)`。   |
| `enforce`           | Vite：`'post'`；Rsbuild：`'pre'` | 设置样式转换顺序。                                           |

`include` 和 `exclude` 支持正则表达式、路径片段字符串，以及 `*`、`**` 通配符。默认只匹配 `.css` 文件并跳过 `node_modules`。

规则按 `configs` 数组顺序检查，第一条命中规则生效。规则会继承外层配置；规则中设置的 `include`、`exclude`、`layerName` 等同名字段覆盖外层值。`layerName` 函数接收 `filePath`、`fileName`、`ext` 和 `code` 上下文。

插件会解析 CSS `@import` 对应的实际资源路径，再为命中的导入添加 `layer(name)`；此处理允许 Tailwind 等会内联 CSS 导入的构建链在内联前确定图层。直接处理 CSS 文件时会保留 `@charset`、`@import`、`@namespace` 等前置规则；默认遇到已声明命名 `@layer` 的 CSS 时跳过包裹。

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/style-layer build
pnpm --filter @uno-pc/style-layer test
pnpm --filter @uno-pc/style-layer typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。
