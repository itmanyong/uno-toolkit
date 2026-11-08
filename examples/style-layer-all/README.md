# @uno-pc/style-layer 使用示例

演示 CSS Cascade Layers 样式分层与 `@import` 图层注入。

## 运行

在仓库根目录执行 `pnpm install`，然后：

```bash
cd examples/style-layer-all
pnpm dev
```

开发服务默认位于 http://localhost:3000。生产构建用 `pnpm build`，本地预览构建产物用 `pnpm preview`。

## 演示内容

`rstack.config.ts` 配置了两条按顺序匹配的规则：`src/vendor.css` 归入 `vendor` 层，`src/index.css` 归入 `application` 层；`index.css` 中的 `@import "./vendor.css"` 会被注入 `layer(vendor)`。

| 观察方式                            | 预期效果                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| 打开 DevTools 查看 `.box`           | 同一选择器分别来自 `vendor` 与 `application` 两个层，可观察层叠优先级差异 |
| 检查构建产物的 CSS                  | 可见 `@layer application` 包裹的规则与导入的 layer 标记                   |
| 把 `skipIfLayerExists` 改为 `false` | 可对比含命名 `@layer` 的 CSS 文件在两种配置下的产物差异                   |

`src/index.css` 不要预先写命名 `@layer` 声明，否则默认的 `skipIfLayerExists: true` 会跳过包裹，示例就看不到分层效果。

## 关键文件

- `rstack.config.ts`：注册 `StyleLayerPluginRsbuild` 与多规则配置
- `src/vendor.css`：模拟第三方样式
- `src/index.css`：应用样式与 `@import`
- `src/index.ts`：演示页面

完整使用文档：[apps/website/docs/plugins/style-layer.md](../../apps/website/docs/plugins/style-layer.md)
