# @uno-pc/style-rewrite

使用 Rust 在构建期按配置重写 CSS：把命中内容替换为 `rewrite`，或在命中内容后追加。命中内容会被智能识别为 CSS 选择器或普通文本，分别作用于声明块或匹配到的文本。提供 Vite 和 Rsbuild 插件。

- 📖 在线文档：<https://itmanyong.github.io/uno-toolkit/plugins/style-rewrite>

## 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 从源码编译原生扩展需要 Rust 和 Cargo

## 安装

```sh
pnpm add -D @uno-pc/style-rewrite
```

### Vite

```ts
import { StyleRewritePluginVite } from "@uno-pc/style-rewrite/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    StyleRewritePluginVite({
      configs: [
        {
          matchPathReg: "**/node_modules/**/*.css",
          rewriteMatchReg: [".ant-btn", ".ant-input"],
          rewriteContent: "border-radius: 8px;",
          rewriteType: "append",
        },
        {
          matchPathReg: ["**/src/**/*.css", /theme\.css$/],
          rewriteMatchReg: "color: #1677ff",
          rewriteContent: "color: var(--primary-color)",
        },
      ],
    }),
  ],
});
```

### Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { StyleRewritePluginRsbuild } from "@uno-pc/style-rewrite/rsbuild";

export default defineConfig({
  plugins: [
    StyleRewritePluginRsbuild({
      configs: [
        {
          matchPathReg: "**/src/**/*.css",
          rewriteMatchReg: ".card",
          rewriteContent: "box-shadow: 0 2px 8px rgb(0 0 0 / 12%);",
        },
      ],
    }),
  ],
});
```

## 配置

`configs` 是配置数组，数组中每个对象都是一项独立配置，按数组顺序依次执行。

| 配置项        | 默认值    | 说明                                                                                       |
| ------------- | --------- | ------------------------------------------------------------------------------------------ |
| `pathReg`     | 全部 css  | 需要处理的 css 匹配路径。支持数组；规则与 style-layer 的 `include` 一致：正则、路径片段、`*` / `**` 通配符。 |
| `matchReg`    | —         | 需要命中的内容。支持数组，每项都会执行一次匹配；可以是具体文本，也可以是正则。               |
| `rewrite`     | —         | 命中内容要替换为的目标内容。                                                               |
| `rewriteType` | `replace` | `replace` 替换覆写；`append` 追加内容，选择器内会先移除同名属性再追加。                     |
| `enforce`     | Vite：`post`；Rsbuild：`pre` | `transform` 模式的样式转换顺序。                                          |
| `mode`        | `transform` | `transform` 在源文件阶段改写；`asset` 在构建产物阶段改写最终 CSS（仅构建生效）。           |
| `assetStage`  | `summarize` | `asset` 模式读取产物的时机，可选 `additions`、`optimize-size`、`summarize`、`optimize-transfer`。 |

### 匹配规则

- 每个 css 文件会先整文件压缩成一行（去掉注释、折叠空白），再在压缩结果上匹配，因此 `matchReg` 中不应包含换行或多空格。
- 写回的也是压缩后的单行 CSS。
- 先按字面量查找，字面量不存在时才把 `matchReg` 当作正则（Rust `regex`，不支持 lookahead、反向引用）。
- 字面量命中不会落在更长的标识符或选择器片段中间：`.btn` 不会命中 `.btn-link`，`color:red` 不会命中 `background-color:red`。

### 选择器与普通文本

命中内容会被智能识别：

- 命中文本本身构成完整选择器、紧跟声明块、且落在选择器位置上时，按**选择器**处理：`replace` 用 `rewrite` 替换该选择器内的全部声明；`append` 先移除该选择器内与 `rewrite` 同名的已有声明，再把新样式追加到声明块末尾。
- 其余情况按**文本**处理：`replace` 直接替换命中的文本，`append` 直接拼在命中文本之后。

```css
/* 原始 */
.btn {
  color: red;
}
```

| 配置                                                        | 结果                    |
| ----------------------------------------------------------- | ----------------------- |
| `{ rewriteMatchReg: ".btn", rewriteContent: "color:blue" }`                | `.btn{color:blue}`      |
| `{ rewriteMatchReg: ".btn", rewriteContent: "color:blue", rewriteType: "append" }` | `.btn{color:blue}` |
| `{ rewriteMatchReg: ".btn", rewriteContent: "padding:0", rewriteType: "append" }` | `.btn{color:red;padding:0}` |
| `{ rewriteMatchReg: "color:red", rewriteContent: "color:blue" }`           | `.btn{color:blue}`      |
| `{ rewriteMatchReg: "color:red", rewriteContent: ";padding:0", rewriteType: "append" }` | `.btn{color:red;padding:0}` |

按文本追加时插件不会自动补分隔符，需要自己在 `rewrite` 里带上 `;`。

### 追加时同名属性的处理

按选择器 `append` 时，先移除该声明块内与 `rewrite` 同名的已有声明，再追加新样式，因此同名属性最终只保留 `rewrite` 提供的那一条，且位于声明块末尾。同名判定规则：

- 属性名比较：标准属性不区分大小写（`COLOR` 与 `color` 同名）；自定义属性 `--x` 按规范区分大小写。
- 厂商前缀视为不同属性：`-webkit-transform` 与 `transform` 互不同名。
- `!important` 不参与判定：旧声明带 `!important` 同样会被移除，新声明是否带 `!important` 由 `rewrite` 决定。
- 块内同名声明重复出现时全部移除；`rewrite` 含多条声明时按其属性名逐条移除。
- 嵌套规则（如 `&:hover{...}`）与无法解析为 `属性名: 值` 的片段原样保留，不参与同名比较。
- 没有移除任何声明时，其余声明保持原有顺序；`rewrite` 不含属性名（例如只是值片段）时不做移除，只追加。

### 产物阶段改写（asset 模式）

默认的 `transform` 模式只能看到源文件内容。若样式由 postcss（如 Panda、Tailwind 的 postcss 插件）在构建管线后段生成，`transform` 拿到的仍是源文件，改不到最终样式；此时用 `mode: "asset"`，在产物阶段读取已生成、已压缩的 CSS 资源再改写。

```ts
StyleRewritePluginRsbuild({
  mode: "asset",
  configs: [
    {
      matchPathReg: "**/static/css/**/*.css",
      rewriteMatchReg: ".light{",
      rewriteContent: ".light,.light .chakra-theme:not(.dark){",
    },
  ],
});
```

- `pathReg` 此时匹配的是**产物文件名**（如 `static/css/index.<hash>.css`），不是源码路径。
- 读到的内容是压缩后的单行 CSS，`matchReg` 需按压缩形态书写。
- 只对生产构建生效：开发模式下样式由运行时注入，没有可读写的 CSS 资源。
- 改写发生在内容哈希计算之前，产物文件名中的 hash 会随改写结果变化。

### 执行顺序与未命中

- 多条配置命中同一文件时按 `configs` 数组顺序叠加：前一项的结果作为后一项的输入。
- 同一条配置内的多个 `matchReg` 依次执行。
- 文件没有命中任何规则时不写回，保持原始内容与排版不变。

## 开发

在仓库根目录执行：

```sh
pnpm --filter @uno-pc/style-rewrite build
pnpm --filter @uno-pc/style-rewrite test
pnpm --filter @uno-pc/style-rewrite typecheck
```

`build` 和 `test` 会先编译当前平台的 Rust 原生扩展。pnpm catalog 中心化管理 JavaScript 依赖版本，Rust 依赖由包内 Cargo manifest 管理。