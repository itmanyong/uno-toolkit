---
"@uno-pc/jsx-directive": patch
"@uno-pc/signals-transform": patch
"@uno-pc/style-layer": patch
"@uno-pc/style-rewrite": patch
---

统一四个子包的插件 API 命名为"包名+Plugin+平台名"格式，并调整配置字段与默认值。

jsx-directive:

- 导出 `JsxDirectivePluginVite` / `JsxDirectivePluginRsbuild`
- 默认 prefix 改为 `x-`，支持字符串或字符串数组配置多个前缀
- `ifFallback` 下放到 `vIf.notFallback`，`show` 重命名为 `vShow`，`whenTrue`/`whenFalse` 重命名为 `whenTrueValue`/`whenFalseValue`
- 移除 `v-bind` 的 `:name` 冒号简写语法支持

style-layer:

- 导出 `StyleLayerPluginVite` / `StyleLayerPluginRsbuild`
- `enforce` 默认值改为 `pre`

style-rewrite:

- 导出 `StyleRewritePluginVite` / `StyleRewritePluginRsbuild`
- 配置字段 `pathReg` -> `matchPathReg`，`matchReg` -> `rewriteMatchReg`，`rewrite` -> `rewriteContent`
- `enforce` 默认值改为 `pre`

signals-transform:

- 导出 `SignalsTransformPluginVite` / `SignalsTransformPluginRsbuild`
