# Changesets

本目录由 [`@changesets/cli`](https://github.com/changesets/changesets) 自动生成并管理。
它用于管理本 monorepo 中多个 npm 包的**版本号**与**发布流程**。

## 工作流

1. 开发者在本地完成代码改动后，执行 `pnpm changeset` 添加一个变更集（描述改了什么、属于 `patch` / `minor` / `major`）。
2. 变更集以 `*.md` 文件形式保存在 `.changeset/` 目录并提交到 `main`。
3. 推送到 `main` 后，CI（`.github/workflows/deploy.yml`）会：
   - 先构建三个插件的全平台原生二进制并发布到 npm；
   - 再构建文档站点并部署到 GitHub Pages。
   - `changeset version` 会根据待发布的变更集提升版本号、写入 `CHANGELOG.md`；
   - `changeset publish` 将版本发生变化的包发布到 npm（已存在版本会自动跳过）。

## 常用命令

```bash
pnpm changeset         # 交互式添加变更集
pnpm version:packages  # 本地模拟版本提升（不会发布）
pnpm release           # 本地发布（需已登录 npm，仅用于调试）
```

> 注意：`.changeset/README.md` 与 `.changeset/config.json` 请勿删除；`*.md` 中除本文件外的变更集会在发布后被自动消费。
