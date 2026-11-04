# AGENTS.md

## 命令

- `pnpm dev` 启动开发服务
- `pnpm build` 生产构建
- `pnpm preview` 预览构建产物

## 约束

- 本示例只演示 `@uno-pc/signals-transform`；`rstack.config.ts` 中的 `SignalsTransformRsbuild` 注册不可移除。
- 应用需保留 `@preact/signals-react` 运行时依赖，转换注入的 Hook 来自 `@preact/signals-react/runtime`。
- 修改示例用法时，同步更新 `../../apps/website/docs/plugins/signals-transform.md` 的完整使用示例。

## 文档

- 插件文档：`../../apps/website/docs/plugins/signals-transform.md`
- Rsbuild：https://rsbuild.rs/llms.txt
