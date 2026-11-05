---
description: Uno Toolkit 四个示例项目的运行方式、交互验证步骤和构建产物检查方法。
---

# 可运行示例

四个包各有一个独立的示例项目，位于仓库 `examples/` 目录。示例中的代码与对应文档的用法一致，可以直接启动、交互，并在构建产物中确认转换结果。

## 示例一览

| 包 | 示例目录 | 技术栈 | 文档 |
| --- | --- | --- | --- |
| `@uno-pc/jsx-directive` | `examples/jsx-directive-all` | React + Rsbuild | [/plugins/jsx-directive](/plugins/jsx-directive) |
| `@uno-pc/style-layer` | `examples/style-layer-all` | Vanilla TS + CSS + Rsbuild | [/plugins/style-layer](/plugins/style-layer) |
| `@uno-pc/signals-transform` | `examples/signals-transform-all` | React + Preact Signals + Rsbuild | [/plugins/signals-transform](/plugins/signals-transform) |
| `@uno-pc/reactivue` | `examples/reactivue-all` | React 19 + VueUse + Rsbuild | [/plugins/reactivue](/plugins/reactivue) |

四个示例都使用 Rsbuild，因此文档中的完整示例统一采用 `XxxRsbuild` 入口；Vite 用法在各包文档的「安装与配置」中给出。

## 运行方式

在仓库根目录安装依赖后，进入任一示例目录：

```sh
pnpm install

cd examples/jsx-directive-all
pnpm dev          # 开发服务，默认 http://localhost:3000
pnpm build        # 生产构建，产物在该示例的 dist 目录
pnpm preview      # 预览构建产物
```

另外几个示例把目录名换成 `examples/style-layer-all`、`examples/signals-transform-all` 或 `examples/reactivue-all` 即可。

## 各示例的演示内容

### examples/jsx-directive-all

| 操作 | 预期效果 |
| --- | --- |
| 点击 `ready` / `loading` / `idle` | `v-if` / `v-else-if` / `v-else` 条件链只渲染一个分支 |
| 点击「切换 v-show」 | 元素保留在 DOM 中，内联 `display` 在 `none` 与缺省之间变化 |
| 观察显示控制区 | 已有 `style` 表达式的元素保留 `color`，并叠加 `v-show` 写入的 `display` |
| 在文本框或 textarea 输入 | `v-text` 更新内容，隐式与显式 setter 的 `v-model` 同步更新 |
| 观察内容与列表区 | `v-html` 注入 HTML，`v-for` 渲染列表并可与 `v-if` 同用 |
| 观察属性绑定区 | `v-bind` 展开对象，具名绑定设置图片属性 |
| 操作 checkbox、radio、select 和组件输入框 | 原生控件模型、默认组件模型及具名组件模型分别更新 |

条件链的三个分支在源码中不必写在同一行，分支之间允许换行与缩进（兼容 Prettier 等代码格式化工具），仅非空白文本、逗号或其他 JSX 节点会中断链条。`tsconfig.json` 通过 `types` 引入包提供的 JSX 指令属性声明。

### examples/style-layer-all

`rstack.config.ts` 配置了两条按顺序匹配的规则：`src/vendor.css` 归入 `vendor` 层，`src/index.css` 归入 `application` 层；`index.css` 中的 `@import "./vendor.css"` 会被注入 layer。

| 观察方式 | 预期效果 |
| --- | --- |
| DevTools 查看 `.box` | 同一选择器分别来自 `vendor` 与 `application` 两个层，可观察层叠优先级差异 |
| 构建产物的 CSS | 可见 `@layer vendor` 与 `@layer application` 包裹的规则 |
| 把 `skipIfLayerExists` 改为 `false` | 可对比含命名 `@layer` 的 CSS 在两种配置下的产物差异 |

### examples/signals-transform-all

`rstack.config.ts` 以 `mode: "auto"` 注册插件。组件只访问 `count.value`，没有手写任何跟踪代码；自定义 Hook `useDoubledCount` 用 `@useSignals` 显式标记。

| 操作 | 预期效果 |
| --- | --- |
| 点击 `+1` | 计数与派生值同步更新，说明组件已获得信号跟踪能力 |
| 点击「重置」 | 计数与派生值同时归零 |
| 把 `mode` 改为 `manual` 或 `all` | 可对比三种模式下哪些函数被转换 |

### examples/reactivue-all

页面按 API 分节，每节给出「普通 React 写法 vs reactivue 写法」或「文本 / 结构两条更新通道」的对照，并注入 react-scan：React 重渲染的组件会闪高亮，文本直写的块不会。

| 操作 | 预期效果 |
| --- | --- |
| 对照左右两个计数器各点 `+1` | 左侧（`useState`）React 渲染次数随点击增长；右侧（`ref` + TextBinding）宿主渲染次数恒定，文本直写 |
| `computed` 一节点 `other +1` | computed 求值计数不变，页面无任何 DOM 写入（依赖缓存） |
| `Block` 一节追加 / 移除列表项 | 结构块走 React render + reconcile，react-scan 高亮该块 |
| `v-memo` 一节点 `epoch +1` | deps 变化强制整块刷新：块内非响应式 `renderNonce` 递增是证物，普通块不随它更新（额外触发源语义）；块内不做文本切分 |
| `VueUse` 一节 toggle 与观察时钟 | `useToggle` / `useNow` 经 compat 桥工作，更新同样是文本直写 |
| props 一节在输入框输入 | React 宿主重渲染 → syncProps 写入 reactive props → 依赖 props 的块自动更新；setup 执行时间戳不变（只跑一次） |

`rstack.config.ts` 同时注册 `ReactivueRsbuild` 与 `JsxDirectiveRsbuild`：前者（`pre` 档）消费 `v-memo` 并切块，后者（default 档）处理其余指令，顺序由插件档位保证、与注册先后无关。

## 在构建产物中确认转换

| 示例 | 检查方式 |
| --- | --- |
| `jsx-directive-all` | 在 `dist` 的 JS 产物中检索不到 `v-if` 等指令名，取而代之的是条件表达式与 `display` 赋值 |
| `style-layer-all` | 在 `dist` 的 CSS 产物中可见 `@layer vendor` 与 `@layer application` |
| `signals-transform-all` | `dist` 的 JS 产物包含 `@preact/signals-react/runtime` 运行时代码与 `try` / `finally` 结构；生产压缩会重命名 `useSignals`，可用插件核心 API `transformSignals` 查看注入后的源码 |
| `reactivue-all` | `dist` 的 JS 产物包含 `TextBinding`、`MemoBlock`、`createCompiledHost` 引用；`v-memo` 只出现在 UI 说明文字中，不残留指令 |

如果希望看到未经压缩的转换结果，可以直接调用各插件导出的核心 API（`transformDirectives`、`transformSignals`、`resolveStyleLayer`）对源码做一次转换。
