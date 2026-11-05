---
"@uno-pc/reactivue": patch
---

hooks 检测改为按导入源识别：只把从 `react` / `react-dom` 导入的 `use*` 名字视为 React hooks（含 alias），VueUse 等组合式函数不再误触发切块降级。`./compat` 补齐 `hasInjectionContext` 与 `TransitionGroup` 导出，`@vueuse/core` 经 `vue` alias 实测可用（`tests/vueuse.test.tsx`，含 useToggle 交互与 useNow 渲染）。修复 `MemoBlock`：deps 中的纯 ref 响应式依赖此前没有任何订阅者，deps 变化不触发整块刷新；现由运行时 effect 显式订阅并在微任务事务中比较。修复 `Block`：`cell.alive` 在首次 commit 的 layout cleanup 后不被恢复，导致所有块只有第一次依赖更新生效（结构块 / `v-memo` deps / props 桥同症状）；现于 effect 重建时恢复存活。native-rust 源码按模块拆分为多文件（types/utils/ast/jsx/setup/entry），行为零变更。
