# @uno-pc/style-rewrite

在构建期按配置重写 CSS 的插件：匹配到指定内容后替换它，或在其后追加新样式。使用 Rust 实现匹配与改写，提供 Vite 与 Rsbuild 两种入口。

## 功能说明

插件把每个 css 文件先压缩成一行，再按 `configs` 顺序执行匹配与改写。命中内容会被识别为 CSS 选择器或普通文本：选择器作用于声明块，文本则按字面替换或拼接。

| 能力         | 说明                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 多配置       | `configs` 是数组，每个对象一项配置，按数组顺序依次执行，前一项的结果是后一项的输入。                                                   |
| 路径匹配     | `pathReg` 支持数组、正则、路径片段与 `*` / `**` 通配符，规则与 `@uno-pc/style-layer` 的 `include` 一致；省略时作用于所有 css 文件。      |
| 内容匹配     | `matchReg` 支持数组，每项都会执行一次匹配；取值可以是具体文本，也可以是正则。                                                           |
| 选择器识别   | 命中文本构成完整选择器、紧跟声明块且位于选择器位置时，按选择器处理：`replace` 替换整个声明块，`append` 在声明块末尾追加。               |
| 追加去重     | 选择器 `append` 会先移除声明块内与 `rewrite` 同名的旧声明，再追加新样式；厂商前缀、自定义属性、`!important` 都有明确判定规则。           |
| 单行压缩     | 匹配前整文件压缩成一行（去注释、折叠空白），命中的文件写回压缩后的单行 CSS；未命中的文件保持原样。                                      |
| 构建工具入口 | 导出 `StyleRewriteVite` 与 `StyleRewriteRsbuild`；包根入口另导出 `transformStyleRewrite`、`resolveStyleRewriteConfigs`、`minifyCss` 及相关类型。 |

:::tip
`matchReg` 跑在压缩后的单行 CSS 上，所以不要写成 `color: red` 这种带空格或换行的形态——压缩结果里是 `color:red`。需要保留空格时改用正则，例如 `color:\s*red`。
:::

## 安装与配置

### 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`

### 安装

```sh
pnpm add -D @uno-pc/style-rewrite
# npm 用户：npm install -D @uno-pc/style-rewrite
```

注册插件即启用改写；没有 `configs` 时插件不会处理任何文件。

### 在 Rsbuild 中启用

```ts
// rstack.config.ts
import { define } from "rstack";
import { StyleRewriteRsbuild } from "@uno-pc/style-rewrite/rsbuild";

define.app(() => ({
  plugins: [
    StyleRewriteRsbuild({
      configs: [
        {
          pathReg: "**/node_modules/**/*.css",
          matchReg: [".ant-btn", ".ant-input"],
          rewrite: "border-radius: 8px",
          rewriteType: "append",
        },
        {
          pathReg: "**/src/**/*.css",
          matchReg: "#1677ff",
          rewrite: "var(--primary-color)",
        },
      ],
    }),
  ],
}));
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { StyleRewriteVite } from "@uno-pc/style-rewrite/vite";

export default defineConfig({
  plugins: [
    StyleRewriteVite({
      configs: [
        {
          pathReg: ["**/src/theme.css", /legacy\.css$/],
          matchReg: ".card",
          rewrite: "padding: 24px",
          rewriteType: "append",
        },
      ],
    }),
  ],
});
```

### 配置项

| 配置项        | 默认值                           | 说明                                                         |
| ------------- | -------------------------------- | ------------------------------------------------------------ |
| `configs`     | `[]`                             | 配置数组，数组内一个对象即一项配置，按顺序依次执行。         |
| `pathReg`     | 匹配所有 css 文件                | 需要处理的 css 匹配路径。                                    |
| `matchReg`    | —                                | 需要命中的内容，支持数组。                                   |
| `rewrite`     | —                                | 命中内容要替换为的目标内容。                                 |
| `rewriteType` | `"replace"`                      | `replace` 替换覆写；`append` 追加内容。                      |
| `enforce`     | Vite：`"post"`；Rsbuild：`"pre"` | 设置样式转换顺序。                                           |

`pathReg` 支持正则表达式、路径片段字符串，以及 `*`、`**` 通配符，也可以传数组同时匹配多个路径。

## 匹配与改写规则

### 压缩与匹配

每个 css 文件先整文件压缩成一行：去掉注释、折叠空白、去掉声明块末尾的分号，但保留字符串内容、后代选择器中的空格与 `calc()` 这类需要空格的表达式。匹配和写回都基于这行压缩结果。

- 先按字面量查找 `matchReg`；字面量找不到时才把它当作正则（Rust `regex`，不支持 lookahead 与反向引用）。
- 字面量命中不会落在更长的标识符或选择器片段中间：`.btn` 不会命中 `.btn-link`，`color:red` 不会命中 `background-color:red`。
- 一条配置内的多个 `matchReg` 依次执行；同一文件被多条配置命中时，按 `configs` 数组顺序叠加。
- 所有规则都没有真正改动内容时文件不写回，原始排版保持不变。

### 选择器与文本

命中内容会被智能识别：

- 命中文本本身构成完整选择器、紧跟声明块、且落在选择器位置上时，按**选择器**处理：`replace` 用 `rewrite` 替换该选择器内的全部声明，`append` 先移除同名声明再把新样式追加到末尾。
- 其余情况按**文本**处理：`replace` 直接替换命中的文本，`append` 直接拼在命中文本之后。

```css
/* 原始 */
.btn {
  color: red;
}
```

| 配置                                                                        | 结果                        |
| --------------------------------------------------------------------------- | --------------------------- |
| `{ matchReg: ".btn", rewrite: "color:blue" }`                                | `.btn{color:blue}`          |
| `{ matchReg: ".btn", rewrite: "color:blue", rewriteType: "append" }`         | `.btn{color:blue}`          |
| `{ matchReg: ".btn", rewrite: "padding:0", rewriteType: "append" }`          | `.btn{color:red;padding:0}` |
| `{ matchReg: "color:red", rewrite: "color:blue" }`                           | `.btn{color:blue}`          |
| `{ matchReg: "color:red", rewrite: ";padding:0", rewriteType: "append" }`    | `.btn{color:red;padding:0}` |

按文本追加时插件不会自动补分隔符，需要自己在 `rewrite` 里带上 `;`。

### 追加时的同名处理

按选择器 `append` 时，先移除声明块内与 `rewrite` 同名的旧声明，再追加新样式，因此同名属性最终只保留 `rewrite` 提供的那一条，且位于声明块末尾。判定规则：

- 标准属性名不区分大小写（`COLOR` 与 `color` 同名）；自定义属性 `--x` 按规范区分大小写。
- 厂商前缀视为不同属性：`-webkit-transform` 与 `transform` 互不同名。
- `!important` 不参与判定：旧声明带 `!important` 同样被移除，新声明是否带 `!important` 由 `rewrite` 决定。
- 块内同名声明重复出现时全部移除；`rewrite` 含多条声明时按其属性名逐条移除。
- 嵌套规则（如 `&:hover{...}`）与无法解析成 `属性名: 值` 的片段原样保留，不参与比较。
- 没有移除任何声明时其余声明保持原有顺序；`rewrite` 不含属性名（例如只是值片段）时只追加、不移除。

## 完整使用示例

以下代码来自可运行示例 [`examples/style-rewrite-all`](/guide/examples)，用五条规则演示选择器替换、选择器追加去重、文本替换与正则匹配。

### 构建配置 `rstack.config.ts`

```ts
import { define } from "rstack";
import { StyleRewriteRsbuild } from "@uno-pc/style-rewrite/rsbuild";

define.app(() => ({
  plugins: [
    StyleRewriteRsbuild({
      configs: [
        {
          pathReg: "**/src/vendor.css",
          matchReg: ".card",
          rewrite: "padding: 24px",
          rewriteType: "append",
        },
        {
          pathReg: "**/src/index.css",
          matchReg: ".btn",
          rewrite:
            "background: #8ab4f8;color: #020917;border: 0;padding: 10px 16px;border-radius: 8px",
          rewriteType: "replace",
        },
        {
          pathReg: ["**/src/vendor.css", "**/src/index.css"],
          matchReg: "#f28b82",
          rewrite: "#fdd663",
        },
        {
          pathReg: "**/src/index.css",
          matchReg: "border-left:\\s*4px",
          rewrite: "border-left: 6px",
        },
        {
          pathReg: "**/src/**/*.css",
          matchReg: ".content",
          rewrite: "line-height: 1.6",
          rewriteType: "append",
        },
      ],
    }),
  ],
}));
```

### `src/vendor.css`

```css
.card {
  padding: 8px 12px;
  border: 1px solid #8ab4f8;
  border-radius: 12px;
  color: #f28b82;
}
```

### `src/index.css`

```css
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

.card {
  gap: 10px;
}

.btn {
  background: #2a2f3a;
  color: #fff;
  border: 1px solid #4b5563;
  padding: 6px 10px;
}

.notice {
  border-left: 4px solid #f28b82;
  padding-left: 12px;
  color: #f28b82;
}
```

两个样式文件都在 `src/index.ts` 里通过 `import` 引入，这样各自作为一个独立模块进入插件的 `transform` 钩子；不要写成 `index.css` 里的 `@import`，否则导入的样式不会经过 JavaScript 侧的转换。

### 运行与观察

```sh
cd examples/style-rewrite-all
pnpm dev
```

执行 `pnpm build` 后，构建产物的 CSS 中可见这些结果：

- `vendor.css` 的 `.card` 只剩一条 `padding:24px`，原来的 `8px 12px` 已被移除。
- `index.css` 的 `.btn` 声明块被 `rewrite` 整体覆盖，`gap` 等原有声明不再保留。
- 两个文件里的 `#f28b82` 都变成 `#fdd663`，`.notice` 的左边框由 `4px` 变成 `6px`。
- `.content` 末尾追加了 `line-height:1.6`，原有声明顺序不变。

## 转换约束

- 插件只对 `.css`、`.pcss`、`.postcss` 扩展名注册转换；预处理器源文件（`.scss`、`.less` 等）需要先编译成 css 再处理。
- 匹配与写回都在压缩后的单行 CSS 上完成，因此 `matchReg` 必须书写压缩后的形态；写回的文件也是单行。
- 字面量命中带边界保护，不会改到更长标识符内部的片段；需要精确控制边界时改用正则。
- 正则由 Rust `regex` 执行，不支持 lookahead、lookbehind 与反向引用。
- 选择器 `replace` 会丢掉该选择器内的全部原有声明（包括嵌套规则），确认无副作用后再用。
- 文本 `append` 不补分隔符；选择器 `append` 会自动处理分隔符。
- 未命中任何规则的文件不写回，构建产物保持原始排版。

## 可运行示例

完整项目见[可运行示例](/guide/examples)中的 `examples/style-rewrite-all`，可直接启动并在构建产物的 CSS 里查看重写结果。