# @uno-pc/style-layer

CSS Cascade Layers 样式分层的构建期转换插件。完美解决第三方库样式与源码样式冲突问题。

## 功能说明

插件使用 Rust 在构建期把命中的 CSS 放入指定 `@layer`，并可为命中的 CSS `@import` 添加 `layer(name)`，让样式层叠顺序在构建期确定，而不必在每个 CSS 文件里手写层声明。

| 能力         | 说明                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS 分层     | 把命中的样式文件内容包裹进 `@layer <name> { ... }`。                                                                                        |
| 导入分层     | 解析 CSS `@import` 对应的实际资源路径，为尚未指定 layer 的导入添加 `layer(name)`；便于 Tailwind 等会内联 CSS 导入的构建链在内联前确定图层。 |
| 多规则匹配   | `configs` 按顺序匹配，第一条命中的规则生效；规则继承外层配置，同名字段覆盖外层值。                                                          |
| 动态层名     | `layerName` 可以是字符串，也可以是接收 `filePath`、`fileName`、`ext`、`code` 上下文并返回名称的函数。                                       |
| 前置规则保护 | 直接处理 CSS 文件时保留 `@charset`、`@import`、`@namespace` 等前置规则；默认遇到已声明命名 `@layer` 的 CSS 时跳过包裹。                     |
| 构建工具入口 | 导出 `StyleLayerVite` 与 `StyleLayerRsbuild`；包根入口另导出 `resolveStyleLayer`、`transformStyleLayerImports` 及相关类型。                 |

:::tip
插件的 `transform` 钩子会接收 `css`、`scss`、`sass`、`less`、`styl`、`stylus`、`pcss`、`postcss` 等扩展名，但默认规则 `include` 只匹配 `.css`。需要处理其它预处理器文件时，必须显式配置 `include`。
:::

## 安装与配置

### 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`

### 安装

```sh
pnpm add -D @uno-pc/style-layer
# npm 用户：npm install -D @uno-pc/style-layer
```

注册插件即启用转换；配置对象可以省略。

### 在 Rsbuild 中启用

```ts
// rstack.config.ts
import { define } from "rstack";
import { StyleLayerRsbuild } from "@uno-pc/style-layer/rsbuild";

define.app(() => ({
  plugins: [
    StyleLayerRsbuild({
      include: "**/src/**/*.css",
      layerName: "application",
    }),
  ],
}));
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { StyleLayerVite } from "@uno-pc/style-layer/vite";

export default defineConfig({
  plugins: [
    StyleLayerVite({
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

### 配置项

| 配置项              | 默认值                           | 说明                                                         |
| ------------------- | -------------------------------- | ------------------------------------------------------------ |
| `include`           | `/\.css$/i`                      | 需要处理的文件路径模式。                                     |
| `exclude`           | 匹配 `node_modules` 路径         | 排除的文件路径模式。                                         |
| `layerName`         | `"default"`                      | CSS layer 名称，或返回名称的函数。                           |
| `configs`           | `[]`                             | 按顺序匹配的规则列表；每条规则可单独设置匹配条件与转换参数。 |
| `skipIfLayerExists` | `true`                           | CSS 已包含命名 `@layer` 规则时不再包裹。                     |
| `importLayer`       | `true`                           | 为命中的、尚未指定 layer 的 `@import` 添加 `layer(name)`。   |
| `enforce`           | Vite：`"post"`；Rsbuild：`"pre"` | 设置样式转换顺序。                                           |

`include` 和 `exclude` 支持正则表达式、路径片段字符串，以及 `*`、`**` 通配符。层名需符合 CSS 标识符规则，也支持点分形式（如 `vendor.radix`）；不合法的名称会在构建时抛出错误。

## 完整使用示例

以下代码来自可运行示例 [`examples/style-layer-all`](/guide/examples)，用一个「第三方样式」和一个「应用样式」文件演示多规则分层与 `@import` 图层注入。

### 构建配置 `rstack.config.ts`

```ts
import { define } from "rstack";
import { StyleLayerRsbuild } from "@uno-pc/style-layer/rsbuild";

define.app(() => ({
  plugins: [
    StyleLayerRsbuild({
      configs: [
        { include: "**/src/vendor.css", layerName: "vendor" },
        { include: "**/src/**/*.css", layerName: "application" },
      ],
      skipIfLayerExists: true,
      importLayer: true,
    }),
  ],
}));
```

规则顺序有意义：`vendor.css` 同时命中两条规则，第一条先命中，因此归入 `vendor` 层；`index.css` 只命中第二条，归入 `application` 层。

### `src/vendor.css`

```css
.box {
  color: #f28b82;
  border-color: #f28b82;
}
```

### `src/index.css`

```css
@import "./vendor.css";

body {
  margin: 0;
  color: #fff;
  font-family: Inter, Helvetica, Arial, sans-serif;
  background-image: linear-gradient(to bottom, #020917, #101725);
}

.content {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px;
}

.box {
  padding: 12px 16px;
  border: 2px solid #8ab4f8;
  border-color: #8ab4f8;
}
```

:::warning
本文件不要预先写命名 `@layer` 声明，否则 `skipIfLayerExists: true` 会跳过包裹，示例就看不到分层效果。
:::

### 运行与观察

```sh
cd examples/style-layer-all
pnpm dev
```

在 DevTools 中查看 `.box`，同一选择器分别来自 `vendor` 与 `application` 两个层。执行 `pnpm build` 后，CSS 产物中可见 `@layer vendor` 与 `@layer application` 包裹的规则；把 `skipIfLayerExists` 设为 `false` 可对比含命名 `@layer` 的 CSS 在两种配置下的差异。

## 转换约束

- 规则按 `configs` 数组顺序检查，**第一条命中规则生效**；未命中任何规则的文件不会被处理。
- 规则继承外层配置，规则里的 `include`、`exclude`、`layerName` 等同名字段覆盖外层值。
- 默认匹配 `.css` 并跳过 `node_modules`；处理其它扩展名或第三方包时需要显式调整 `include` / `exclude`。
- 已有命名 `@layer` 的 CSS 默认跳过包裹；不合法的 layer 名称会在构建时报错。

## 可运行示例

完整项目见[可运行示例](/guide/examples)中的 `examples/style-layer-all`，可直接启动并查看 CSS 产物中的分层结果。
