# 可运行示例

三个插件各有一个独立的示例项目，位于仓库 `examples/` 目录。示例中的代码与对应插件文档的「完整使用示例」一致，可以直接启动、交互，并在构建产物中确认转换结果。

## 示例一览

| 插件 | 示例目录 | 技术栈 | 文档 |
| --- | --- | --- | --- |
| `@uno-pc/jsx-directive` | `examples/jsx-directive-all` | React + Rsbuild | [/plugins/jsx-directive](/plugins/jsx-directive) |
| `@uno-pc/style-layer` | `examples/style-layer-all` | Vanilla TS + CSS + Rsbuild | [/plugins/style-layer](/plugins/style-layer) |
| `@uno-pc/signals-transform` | `examples/signals-transform` | React + Preact Signals + Rsbuild | [/plugins/signals-transform](/plugins/signals-transform) |

三个示例都使用 Rsbuild，因此文档中的完整示例统一采用 `XxxRsbuild` 入口；Vite 用法在各插件文档的「安装与配置」中给出。

## 运行方式

在仓库根目录安装依赖后，进入任一示例目录：

```sh
pnpm install

cd examples/jsx-directive-all
pnpm dev          # 开发服务，默认 http://localhost:3000
pnpm build        # 生产构建，产物在该示例的 dist 目录
pnpm preview      # 预览构建产物
```

另外两个示例把目录名换成 `examples/style-layer-all` 或 `examples/signals-transform` 即可。

## 各示例的演示内容

### examples/jsx-directive-all

| 操作 | 预期效果 |
| --- | --- |
| 点击 `ready` / `loading` / `idle` | `v-if` / `v-else-if` / `v-else` 条件链只渲染一个分支 |
| 点击「切换 v-show」 | 元素保留在 DOM 中，内联 `display` 在 `none` 与缺省之间变化 |
| 观察第二个演示区 | 已有 `style` 表达式的元素保留 `color`，并叠加 `v-show` 写入的 `display` |

条件链的三个分支在源码中不必写在同一行，分支之间允许换行与缩进（兼容 Prettier 等代码格式化工具），仅非空白文本、逗号或其他 JSX 节点会中断链条。`tsconfig.json` 通过 `types` 引入包提供的 JSX 指令属性声明。

### examples/style-layer-all

`rstack.config.ts` 配置了两条按顺序匹配的规则：`src/vendor.css` 归入 `vendor` 层，`src/index.css` 归入 `application` 层；`index.css` 中的 `@import "./vendor.css"` 会被注入 layer。

| 观察方式 | 预期效果 |
| --- | --- |
| DevTools 查看 `.box` | 同一选择器分别来自 `vendor` 与 `application` 两个层，可观察层叠优先级差异 |
| 构建产物的 CSS | 可见 `@layer vendor` 与 `@layer application` 包裹的规则 |
| 把 `skipIfLayerExists` 改为 `false` | 可对比含命名 `@layer` 的 CSS 在两种配置下的产物差异 |

### examples/signals-transform

`rstack.config.ts` 以 `mode: "auto"` 注册插件。组件只访问 `count.value`，没有手写任何跟踪代码；自定义 Hook `useDoubledCount` 用 `@useSignals` 显式标记。

| 操作 | 预期效果 |
| --- | --- |
| 点击 `+1` | 计数与派生值同步更新，说明组件已获得信号跟踪能力 |
| 点击「重置」 | 计数与派生值同时归零 |
| 把 `mode` 改为 `manual` 或 `all` | 可对比三种模式下哪些函数被转换 |

## 在构建产物中确认转换

| 示例 | 检查方式 |
| --- | --- |
| `jsx-directive-all` | 在 `dist` 的 JS 产物中检索不到 `v-if` 等指令名，取而代之的是条件表达式与 `display` 赋值 |
| `style-layer-all` | 在 `dist` 的 CSS 产物中可见 `@layer vendor` 与 `@layer application` |
| `signals-transform` | `dist` 的 JS 产物包含 `@preact/signals-react/runtime` 运行时代码与 `try` / `finally` 结构；生产压缩会重命名 `useSignals`，可用插件核心 API `transformSignals` 查看注入后的源码 |

如果希望看到未经压缩的转换结果，可以直接调用各插件导出的核心 API（`transformDirectives`、`transformSignals`、`resolveStyleLayer`）对源码做一次转换。
