# @uno-pc/jsx-directive 使用示例

演示 React JSX 条件、显示、内容、列表、属性绑定和双向绑定指令的构建期转换。

## 运行

在仓库根目录执行 `pnpm install`，然后：

```bash
cd examples/jsx-directive-all
pnpm dev
```

开发服务默认位于 http://localhost:3000。生产构建用 `pnpm build`，本地预览构建产物用 `pnpm preview`。

## 演示内容

| 操作 | 预期效果 |
| --- | --- |
| 点击 `ready` / `loading` / `idle` | `v-if` / `v-else-if` / `v-else` 条件链只渲染对应分支 |
| 点击「切换 v-show」 | 元素保留在 DOM 中，内联 `display` 在 `none` 与缺省之间切换 |
| 观察显示控制区 | 已有 `style` 表达式的元素仍保留 `color`，并叠加 `v-show` 写入的 `display` |
| 在文本框或 textarea 输入 | `v-text` 更新内容；隐式与显式 setter 的 `v-model` 同步更新 |
| 观察内容与列表区 | `v-html` 注入 HTML；`v-for` 渲染列表，也可与 `v-if` 同用 |
| 观察属性绑定区 | `v-bind` 展开对象，`v-bind:src` / `v-bind:alt` 绑定具名属性 |
| 操作 checkbox、radio 和 select | 布尔值、数组、单选和多选模型同步更新 |
| 编辑两个组件输入框 | 默认 `v-model` 和具名 `v-model:first` 更新各自的状态 |

转换器允许条件分支之间有换行与缩进（兼容 Prettier 等代码格式化工具）；本示例的 `src/App.tsx` 按目录约定把三个分支写在同一行。非空白文本、逗号或其他 JSX 节点会中断链条。

`tsconfig.json` 的 `compilerOptions.types` 引入了包提供的 JSX 指令属性声明。`v-for` 的 `item` 由构建期创建，源码中的同名占位变量仅供 TypeScript 检查；组件模型的 props 需设为可选，因为属性由插件在编译期注入。

## 确认转换发生在构建期

执行 `pnpm build` 后在 `dist` 的 JS 产物中检索：不会出现已转换的指令属性名，取而代之的是条件表达式、样式属性、列表映射和绑定处理函数。

## 关键文件

- `rstack.config.ts`：注册 `JsxDirectiveRsbuild`
- `src/App.tsx`：各指令的可交互用法
- `tsconfig.json`：JSX 指令类型声明

完整使用文档：[apps/website/docs/plugins/jsx-directive.md](../../apps/website/docs/plugins/jsx-directive.md)
