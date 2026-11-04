# @uno-pc/jsx-directive 使用示例

演示 React JSX 条件指令与显示控制的构建期转换。

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
| 观察第二个演示区 | 已有 `style` 表达式的元素仍保留 `color`，并叠加 `v-show` 写入的 `display` |

条件链三个分支在 `src/App.tsx` 中不必写在同一行，分支之间允许换行与缩进（兼容 Prettier 等代码格式化工具），仅非空白文本、逗号或其他 JSX 节点会中断链条。

`tsconfig.json` 的 `compilerOptions.types` 引入了包提供的 JSX 指令属性声明，因此 `v-if` 等指令属性在 TSX 中有类型支持。

## 确认转换发生在构建期

执行 `pnpm build` 后在 `dist` 的 JS 产物中检索：不会出现 `v-if` 这类属性名，取而代之的是条件表达式与 `display` 赋值。

## 关键文件

- `rstack.config.ts`：注册 `JsxDirectiveRsbuild`
- `src/App.tsx`：条件链与 `v-show` 用法
- `tsconfig.json`：JSX 指令类型声明

完整使用文档：[apps/website/docs/plugins/jsx-directive.md](../../apps/website/docs/plugins/jsx-directive.md)
