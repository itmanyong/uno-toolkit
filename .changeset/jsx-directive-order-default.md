---
"@uno-pc/jsx-directive": patch
---

Rsbuild 插件的 transform 不再使用 `order: "pre"`：Rsbuild 的多个 pre transform 按注册逆序执行，default 档保证 `@uno-pc/reactivue`（pre，消费 `v-memo`）恒先于本插件运行，顺序不再依赖注册先后。残留 `v-memo` 的报错文案同步调整为提示注册 reactivue 的 Vite/Rsbuild 插件（顺序由插件档位保证）。
