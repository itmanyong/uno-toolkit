---
"@uno-pc/reactivue": minor
---

新增初始架构包：接入 `@vue/reactivity`，实现 setup 只执行一次、props 响应式桥、统一事务调度与文本/结构双通道更新，并提供 Vite / Rsbuild 插件与 `./compat`、`./internal` 入口。编译期已实现 JSX 切块（文本 / 结构 / v-memo）、`v-memo` 消费与阻断错误通道，见包内 README。
