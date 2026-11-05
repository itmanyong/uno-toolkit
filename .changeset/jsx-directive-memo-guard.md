---
"@uno-pc/jsx-directive": minor
---

新增 `v-memo` 的 R-A 语法外壳：指令白名单加入 `memo`、TSX `Attributes` 类型、值校验入口；`DirectiveTransformOptions` 新增 `memo?: 'error' | 'preserve'`（默认 `error`）。输入中残留 `v-memo` 时产出 `errors`，Vite / Rsbuild 插件编译期抛错并提示安装 `@uno-pc/reactivue` 且调整插件顺序。无 `v-memo` 的工程返回结构保持不变。
