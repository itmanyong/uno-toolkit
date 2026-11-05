---
"@uno-pc/reactivue": minor
---

pinia 兼容：compat 补 `isShallow` 导出，setup 式与 options 式 `defineStore` 经 vue alias 实测可用（`tests/pinia.test.tsx` 8 用例）。注意 pinia 4.x 已移除全局 `useStore`，`defineStore` 返回值即 useStore，直接调用。
