# AGENTS.md

## 命令

- `pnpm dev` 启动开发服务
- `pnpm build` 生产构建
- `pnpm preview` 预览构建产物

## 约束

- 本示例只演示 `@uno-pc/style-layer`；`rstack.config.ts` 中的 `StyleLayerRsbuild` 注册不可移除。
- `configs` 的规则顺序有意义，第一条命中的规则生效，调整顺序会改变 `src/vendor.css` 的层归属。
- `src/index.css` 不要预先写命名 `@layer` 声明，否则会触发 `skipIfLayerExists` 跳过包裹。
- 修改示例用法时，同步更新 `../../apps/website/docs/plugins/style-layer.md` 的完整使用示例。

## 文档

- 插件文档：`../../apps/website/docs/plugins/style-layer.md`
- Rsbuild：https://rsbuild.rs/llms.txt
