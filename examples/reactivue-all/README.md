# @uno-pc/reactivue 使用示例

演示 Vue 组合式 API on React：编译期 JSX 切块、`v-memo`、以及经 alias 复用 VueUse。

## 运行

在仓库根目录执行 `pnpm install`，然后：

```bash
cd examples/reactivue-all
pnpm dev
```

开发服务默认位于 http://localhost:3000。生产构建用 `pnpm build`。

## 演示内容

| 操作 | 预期效果 |
| --- | --- |
| 点击 `+1` | `count` / `doubled` 更新，但只有对应的 Text 节点被改写，父组件不重渲染（react-scan 无高亮闪烁） |
| `v-memo` 块 | deps（`doubled`）变化时整块刷新 |
| `now` 行 | VueUse `useNow` 每秒更新，其内部的 `watch` / 生命周期经 `./compat` 桥工作 |
| 点击 `ON/OFF` | VueUse `useToggle` 切换按钮文案 |

## 确认转换发生在构建期

`rstack.config.ts` 先注册 `ReactivueRsbuild`（切块 + 消费 `v-memo` + 注入 `vue` alias），再注册 `JsxDirectiveRsbuild`（展开其余指令；遇残留 `v-memo` 会编译期报错，即 R-A 契约）。执行 `pnpm build` 后，`dist` 产物中包含 `_TextBinding` / `_MemoBlock` 与 `@uno-pc/reactivue/internal` 的运行时代码。

## 关键文件

- `rstack.config.ts`：插件注册顺序（R-A 契约的核心）
- `src/App.tsx`：`defineComponent` + `ref`/`computed` + `v-memo` + VueUse
- `src/env.d.ts`：引用 reactivue 的 `v-memo` JSX 类型声明

完整设计：[REACTIVUE-DESIGN.md](../../REACTIVUE-DESIGN.md)
