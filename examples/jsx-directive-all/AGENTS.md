# AGENTS.md

## 命令

- `pnpm dev` 启动开发服务
- `pnpm build` 生产构建
- `pnpm preview` 预览构建产物

## 约束

- 本示例只演示 `@uno-pc/jsx-directive`；`rstack.config.ts` 中的 `JsxDirectivePluginRsbuild` 注册不可移除。
- `src/App.tsx` 的条件链三个分支必须写在同一行且紧邻，中间不能有任何空白或换行；不要对该行做自动格式化，prettier 拆行会让 `x-else-if` / `x-else` 变成孤立分支。
- 修改示例用法时，同步更新 `../../apps/website/docs/plugins/jsx-directive.md` 的完整使用示例。

## 文档

- 插件文档：`../../apps/website/docs/plugins/jsx-directive.md`
- Rsbuild：https://rsbuild.rs/llms.txt
