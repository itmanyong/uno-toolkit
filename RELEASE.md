# 发布与运维操作指南（RELEASE.md）

本仓库是一个 pnpm monorepo：

- `packages/*`：三个 Rust + napi 原生插件（`@uno-pc/jsx-directive`、`@uno-pc/style-layer`、`@uno-pc/signals-transform`）
- `apps/website`：基于 Rspress 的文档站点
- `examples/*`：可运行的示例

本文件汇总日常开发与「自动发布 / 部署」相关的命令。

---

## 1. 环境准备

```bash
# 安装依赖（workspace 根目录）
pnpm install

# 安装 Rust 工具链（原生插件需要）
# https://rustup.rs 安装后，构建脚本会自动 rustup target add 所需目标
rustup default stable
```

要求：`Node >= 24`、`pnpm == 12.15.0`（仓库已声明 `packageManager`，会自动下载）。

---

## 2. 本地开发命令

```bash
# 全量构建（含原生 + JS）
pnpm build

# 仅构建某个插件（原生 + JS）
pnpm --filter @uno-pc/jsx-directive run build

# 启动文档站本地预览（http://localhost:5173）
pnpm --filter website run dev

# 运行测试 / 类型检查 / Lint
pnpm test
pnpm typecheck
pnpm lint
```

---

## 3. 原生多平台二进制（napi）

原生扩展通过 `scripts/build-native.mjs` 用 `cargo` 编译为 napi 插件（`.node`）。

- 默认构建**当前平台**产物到 `packages/<pkg>/native/<triple>.node`
  （如 `linux-x64-gnu.node`、`darwin-arm64.node`、`win32-x64-msvc.node`）。
- 运行时由 `src/shared/native.ts` 根据 `platform / arch / libc` 自动选择对应 `.node`，
  未命中时回退旧的 `native/index.node`。

```bash
# 构建当前平台
pnpm --filter @uno-pc/jsx-directive run build:native

# 交叉/指定目标三元组
TARGET_TRIPLE=linux-x64-musl node packages/jsx-directive/scripts/build-native.mjs
```

支持的目标三元组（CI 矩阵已全覆盖）：

| 三元组 | 说明 | CI Runner |
| --- | --- | --- |
| `linux-x64-gnu` | Linux x64 (glibc) | ubuntu-latest |
| `linux-x64-musl` | Linux x64 (musl/alpine) | ubuntu-latest（交叉） |
| `linux-arm64-gnu` | Linux arm64 | ubuntu-24.04-arm |
| `darwin-x64` | macOS x64 | macos-latest（交叉） |
| `darwin-arm64` | macOS arm64 | macos-latest |
| `win32-x64-msvc` | Windows x64 | windows-latest |
| `win32-arm64-msvc` | Windows arm64 | windows-latest（交叉） |

> 这些 `.node` 文件已在 `.gitignore` 中忽略，属于构建产物，不应提交。

---

## 4. 版本与发布（Changesets）

版本号与发布由 [`@changesets/cli`](https://github.com/changesets/changesets) 管理，
配置见 `.changeset/config.json`。

### 4.1 添加一次发布变更集

```bash
pnpm changeset
```

交互式选择受影响的包、版本级别（`patch` / `minor` / `major`），并填写变更说明。
会生成 `.changeset/<random>.md`，**请随代码一起提交到 `main`**。

### 4.2 本地预览版本提升（不发布）

```bash
pnpm version:packages   # 等价于 changeset version，会改写版本号与 CHANGELOG.md
```

### 4.3 实际发布（通常由 CI 自动完成，见 §5）

```bash
pnpm release            # 等价于 changeset publish，需 npm login 后本地调试用
```

> 发布前请确保 `npm whoami` 对 `@uno-pc` 作用域有 publish 权限。

---

## 5. 全自动部署工作流（`.github/workflows/deploy.yml`）

推送到 `main`（且命中 `packages/`、`apps/website/`、`examples/`、`.changeset/`、工作流、lockfile 等路径）
或手动 `workflow_dispatch` 触发，严格按以下顺序执行：

1. **`build-native`（矩阵）**：在 ubuntu / ubuntu-arm / macos / windows 上分别编译
   全部 7 个平台原生二进制，作为产物上传。
2. **`release`（依赖 build-native）**：
   - 下载并归集全部 `native/*.node` 到 `packages/*/native/`；
   - `pnpm changeset version` 提升版本、写 CHANGELOG；
   - 构建各包 JS（`build:js`）；
   - `pnpm changeset publish` 发布到 npm（已存在版本自动跳过）；
   - 将版本提升提交回 `main`（commit message 含 `[skip ci]`，避免循环触发）。
3. **`deploy-site`（依赖 release）**：构建文档站（`DOC_BASE=/uno-toolkit/`）并部署到
   GitHub Pages。

> 顺序保证：**先三个插件发布完成，再发布文档站点**。

### 启用前的一次性配置

1. **NPM 令牌**：仓库 `Settings → Secrets → Actions` 新增 `NPM_TOKEN`
   （需对 `@uno-pc` 作用域有 publish 权限）。
2. **开启 Pages**：仓库 `Settings → Pages → Build and deployment → Source` 选择
   **GitHub Actions**。
3. **首次推送**：需包含 `pnpm-lock.yaml`、`pnpm-workspace.yaml` 与工作流文件，
   否则 `pnpm install --frozen-lockfile` 会失败。
4. **首次发布**：至少需要一个变更集（`pnpm changeset`），否则仅部署站点、不发布 npm 包。

---

## 6. 常见问题

- **Q：发布后用户装到的是 Linux 二进制？**
  A：已引入 napi 多平台方案，CI 会为 7 个平台分别编译并随包发布，
  运行时按当前平台自动选择。本地仅 `build:native` 单个平台即可开发。

- **Q：重新发布同一版本号失败？**
  A：npm 不允许重复版本。`changeset publish` 对已存在版本会跳过；
  要用新版本请先 `pnpm changeset` 生成变更集提升版本号。

- **Q：macOS / Windows 二进制构建失败？**
  A：交叉编译（musl、darwin-x64、win32-arm64）依赖对应 runner 的 SDK/链接器。
  若报错，请检查对应 runner 是否具备 musl-tools / 目标 cargo target；
  也可将 `linux-arm64-gnu` 改回在 `ubuntu-latest` 上交叉编译
  （安装 `gcc-aarch64-linux-gnu` 并设置 `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER`）。

- **Q：如何只发某个包？**
  A：changesets 默认按变更集影响范围决定发布哪些包；未变更且无变更集的包不会发布。
