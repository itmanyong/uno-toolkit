# @uno-pc/style-rewrite 使用示例

演示在构建期按配置重写 CSS：选择器替换、选择器追加（先移除同名声明）、文本替换与正则匹配。

## 运行

在仓库根目录执行 `pnpm install`，然后：

```bash
cd examples/style-rewrite-all
pnpm dev
```

开发服务默认位于 http://localhost:3000。生产构建用 `pnpm build`，本地预览构建产物用 `pnpm preview`。

## 演示内容

`rstack.config.ts` 配置了五条按顺序执行的规则：

| 规则                             | 命中                              | 行为                        | 预期结果                                         |
| -------------------------------- | --------------------------------- | --------------------------- | ------------------------------------------------ |
| `.card` / `append`               | `src/vendor.css`                  | 先移除同名 `padding` 再追加 | `padding` 由 `8px 12px` 变成 `24px`，只保留一条  |
| `.btn` / `replace`               | `src/index.css`                   | 整体替换声明块              | 原背景、边框、内边距全部被 `rewriteContent` 覆盖 |
| `#f28b82` / `replace`            | `src/vendor.css`、`src/index.css` | 命中内容按文本替换          | 两个文件里的旧品牌色都变成 `#fdd663`             |
| `border-left:\s*4px` / `replace` | `src/index.css`                   | 字面量找不到时按正则匹配    | `.notice` 左边框由 `4px` 变成 `6px`              |
| `.content` / `append`            | `src/**/*.css`                    | 属性不冲突时直接追加        | `.content` 增加 `line-height: 1.6`               |

`matchPathReg` 决定规则的作用范围：`.card` 的 `padding` 改写只作用于 `src/vendor.css`，品牌色替换则用数组同时覆盖两个文件，因此两个文件里的 `#f28b82` 都会变成 `#fdd663`。

## 关键文件

- `rstack.config.ts`：注册 `StyleRewritePluginRsbuild` 与五条规则
- `src/vendor.css`：模拟第三方样式，演示同名去重追加
- `src/index.css`：应用样式，演示选择器替换与文本替换
- `src/index.ts`：演示页面

完整使用文档：[apps/website/docs/plugins/style-rewrite.md](../../apps/website/docs/plugins/style-rewrite.md)
