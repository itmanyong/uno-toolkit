---
"@uno-pc/jsx-directive": patch
---

transform 新增 **source map** 输出：native 收集顶层编辑区间（变化子树整区间 → 变换文本），偏移统一为 UTF-16 code unit（与 MagicString / JS 字符串索引对齐），Vite / Rsbuild 插件经 magic-string 生成 map（含 sourcesContent）。警告行列换算同步改为 UTF-16 语义。需在构建配置开启 sourceMap。
