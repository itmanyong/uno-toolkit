# AGENTS.md

## 命令

- `pnpm dev` 启动开发服务
- `pnpm build` 生产构建
- `pnpm preview` 预览构建产物

## 约束

- 本示例只演示 `@uno-pc/style-rewrite`；`rstack.config.ts` 中的 `StyleRewritePluginRsbuild` 注册不可移除。
- `configs` 按数组顺序依次执行，前一条的结果是后一条的输入；调整顺序会改变 `src/vendor.css` 中 `.card` 的最终样式。
- `rewriteMatchReg` 在压缩后的单行 CSS 上匹配，不要写成带换行或多空格的形态；`.card` 的选择器规则只作用于 `src/vendor.css`，不要扩大到所有 `src/**/*.css`，否则 `src/index.css` 的 `.card` 也会被改写。
- 修改示例用法时，同步更新 `../../apps/website/docs/plugins/style-rewrite.md` 的完整使用示例。

## 文档

- 插件文档：`../../apps/website/docs/plugins/style-rewrite.md`
- Rsbuild：https://rsbuild.rs/llms.txt
