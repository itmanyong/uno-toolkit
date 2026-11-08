# @uno-pc/signals-transform 使用示例

演示 Preact Signals React 的 `useSignals` 编译期注入。

## 运行

在仓库根目录执行 `pnpm install`，然后：

```bash
cd examples/signals-transform-all
pnpm dev
```

开发服务默认位于 http://localhost:3000。生产构建用 `pnpm build`，本地预览构建产物用 `pnpm preview`。

## 演示内容

| 操作               | 预期效果                                           |
| ------------------ | -------------------------------------------------- |
| 点击 `+1`          | 计数与派生值同步更新，说明组件已获得信号跟踪能力   |
| 点击「重置」       | 计数与派生值同时归零                               |
| 查看 `src/App.tsx` | 组件只访问 `count.value`，没有手写任何跟踪样板代码 |

`rstack.config.ts` 以 `mode: "auto"` 注册插件，`App` 以大写字母开头、包含 JSX 并访问 `.value`，因此会被自动注入 `useSignals`；自定义 Hook `useDoubledCount` 用 `@useSignals` 显式标记。把 `mode` 改成 `manual` 或 `all` 可对比三种模式的转换差异。

## 确认转换发生在构建期

执行 `pnpm build` 后，`dist` 的 JS 产物中包含 `@preact/signals-react/runtime` 的运行时代码与 `try` / `finally` 结构；生产压缩会重命名 `useSignals`，因此以页面交互效果与运行时代码为准。若要直接查看注入后的源码，可用插件核心 API `transformSignals` 对 `src/App.tsx` 做一次转换。

## 关键文件

- `rstack.config.ts`：注册 `SignalsTransformPluginRsbuild`
- `src/App.tsx`：信号状态、组件与自定义 Hook
- `package.json`：`@preact/signals-react` 运行时依赖

完整使用文档：[apps/website/docs/plugins/signals-transform.md](../../apps/website/docs/plugins/signals-transform.md)
