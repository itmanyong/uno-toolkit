# @uno-pc/reactivue × pinia 可行性评估

> 调研日期：2026-11-05。调研对象：**pinia 4.1.0**（npm 当前 latest；设计文档原计划的 "pinia v3" 已被 v4 取代，v3+ 均为 vue-demi 移除后的纯 Vue 3 代码线，依赖面同源）。
> 方法：对 `pinia/dist/pinia.js`（真实发布产物）做 import 面与调用点静态核查，并在 %TEMP% 环境下用本包 `dist/compat` 构建 `vue` 别名做运行时冒烟（见 §5）。所有结论基于实测产物，非记忆断言。

## 1. 结论

**等级：可用（补 1 个导出即可）** —— 非组件上下文与 reactivue setup 上下文均可工作，无需 shim 层架构改动。

- pinia 4.1.0 运行时仅从 `vue` 导入 **21 个 API**，compat 层现有导出覆盖 20 个，唯一缺口是 `isShallow`（一行再导出）。
- pinia **不依赖 Vue app 实例**：`useStore()` 在无 inject 上下文时回退 `activePinia`，`setActivePinia(createPinia())` 即可驱动全部核心路径（冒烟已验证 store 创建 / computed / watch / 实例缓存）。
- devtools 与 SSR 分支在 React 环境下安全降级（详见 §4）。
- 工作量估算：**约 0.5–1 人日**（1 个导出 + 别名注入 + example 验证 + 文档），不涉及 compat 架构变更。

## 2. 依赖面对照表

pinia 4.1.0 `dist/pinia.js` 第 6 行的完整 vue 导入（逐一对照 `packages/reactivue/src/compat/index.ts`）：

| pinia 导入的 vue API | pinia 中的用途 | compat 现状 |
| --- | --- | --- |
| `computed` | store 内 getter、`computedStore` | ✅ 已有（@vue/reactivity 直出） |
| `effectScope` | setup store 的作用域包裹与释放 | ✅ 已有 |
| `getCurrentInstance` | dev 模式缓存 `vm._pStores`（L1370） | ⚠️ 已有但语义不同——compat 返回无 `.proxy` 的精简元信息；pinia 有 `currentInstance && currentInstance.proxy` 守卫，**安全跳过**，无副作用 |
| `getCurrentScope` | 作用域判定 | ✅ 已有 |
| `hasInjectionContext` | 判断能否 `inject(piniaSymbol)`（L80/1350） | ⚠️ 已有但语义略窄——compat 只判定「实例上下文存在」；在 reactivue setup 内返回 true 后 `inject(piniaSymbol)` 查不到值返回 null，随后走 `activePinia` 回退，**行为正确** |
| `inject` | 组件内获取 pinia 实例 | ✅ 已有（compat inject 带 fallback，查不到返回 null/undefined） |
| `isReactive` / `isReadonly` / `isRef` | store 合并前类型探测 | ✅ 已有 |
| `isShallow` | 选项式 store state 探测 | ❌ **缺失（唯一缺口）**——`@vue/reactivity` 原生导出，加一行再导出即可 |
| `markRaw` | 标记 store/实例非响应式 | ✅ 已有 |
| `nextTick` | action 后刷新 / devtools 时序 | ✅ 已有（compat 为 `Promise.resolve().then` 薄封装） |
| `onScopeDispose` | 作用域清理 | ✅ 已有 |
| `reactive` / `ref` / `toRaw` / `toRef` / `toRefs` / `triggerRef` / `unref` | state 与 store 包装 | ✅ 已有 |
| `watch` | $subscribe、setup store 内侦听 | ✅ 已有（compat 薄封装，冒烟验证可独立于组件工作） |

**pinia v3/v4 已不存在的导入**（老版本评估时常见的担忧点，实测产物中均无）：`defineComponent`、`set`/`del`、`isVue2`/`versions`（vue-demi 遗留）、任何渲染器 API（`h`/`createVNode`/`render`/`TransitionGroup` 等）。pinia 4 对 `vue` 的依赖是**纯 reactivity + 实例上下文**，正是 compat 层的覆盖强项。

pinia 其余依赖：
- `nostics`（inlined dependency，与 vue 无关，无影响）。
- `@vue/devtools-api@^8.2.1`：**必选 peer**（`peerDependenciesMeta` 未标 optional），需安装；但 v8 走 `@vue/devtools-kit` 独立通信（实测 dist 零 vue 导入），且仅在 `install(app)` 路径被调用，见 §4。

## 3. app 上下文依赖评估（无 Vue app 的 React 环境）

实测 `dist/pinia.js`：

- `createPinia()` 本身不触碰任何 app 实例；`pinia._a` 仅在 `install(app)` 中赋值（L845）。
- `useStore()` 取 pinia 的顺序（L1350-1355）：显式传参 → `hasInjectionContext() ? inject(piniaSymbol, null) : null` → `activePinia`；命中即 `setActivePinia`。**在 React 中无 inject 上下文时直接落到 `activePinia`**，dev 模式仅在完全没有 activePinia 时抛错（错误信息即官方「outside-component-usage」路径）。
- `install(app)` 内的 `app.provide` / `app.config.globalProperties.$pinia` / devtools 注册（L843-864）在 React 侧**整体不调用即可**，无隐藏的模块加载期副作用（`sideEffects: false`）。

**结论：`setActivePinia(createPinia())` 手动注入完全可行**，与 Vue 官方的非组件用法一致；无需 compat 提供 `createApp` mock。如未来想在 reactivue setup 内也走 inject 通道，可由 compat 的 `provide(piniaSymbol, pinia)` 桥接（现有实现已支持），但非必需。

## 4. devtools / SSR 分支降级

- devtools：所有 `setupDevtoolsPlugin` / `registerPiniaDevtools` 调用点都在 `install(app)` 内或受 `IS_CLIENT && NODE_ENV !== 'test'` 双重守卫（L849/864/1305）。React 下不执行 `install` → devtools 代码零执行；`@vue/devtools-api` 仅需可解析（安装即可），其 v8 运行时自身不 import vue。
- SSR：`IS_CLIENT = typeof window !== "undefined"` 守卫了 devtools 与 store 的 dev 包装；store 创建与 state 响应式核心不依赖 window。旧 v2 的 `useSSRSetup` 已不存在。node 环境冒烟（无 window、无 Vue app）全绿即为降级安全的直接证据。
- `__VUE_PROD_DEVTOOLS__`：pinia 产物用 `typeof !== "undefined"` 探测，未定义时安全短路，无需全局注入。

## 5. 冒烟实证（%TEMP%，未进 git）

环境：`$TMP/pinia-smoke-uno`，pnpm 安装 `pinia@4.1.0` + `react@19.3.1` + `@vue/reactivity`，将本包 `packages/reactivue/dist`（已构建产物）拷贝为 `node_modules/vue/dist`，入口 `index.mjs` 为 `export * from "./dist/compat/index.js"; export { isShallow } from "@vue/reactivity";`（即模拟「compat 层 + 唯一缺失导出补齐」后的最终形态）。

`node smoke.mjs` 输出：

```
initial: 0 0
after inc: 1 2
watch fired: 1 | n = 2 | double = 4
isShallow available: true
store identity stable: true
SMOKE PASS
```

验证点：`createPinia` + `setActivePinia` 加载与驱动 ✅；setup 式 `defineStore` 创建 ✅；state 变更 → `computed` 重算 ✅；compat `watch` 在 store 作用域外可独立侦听且触发 1 次 ✅；`useStore()` 复用同一 store 实例（pinia 内部缓存）✅。**首次 import 即通过，无 ESM linking 失败。**

## 6. 落地清单与工作量

需改动（均为增量，无架构变更）：

1. `packages/reactivue/src/compat/index.ts`：从 `@vue/reactivity` 再导出 `isShallow`（+1 行）。
2. 使用侧（文档/plugin 建议口径）：构建工具中 `vue` / `@vue/runtime-dom` → `@uno-pc/reactivue/compat`（现有 alias 机制已覆盖）；应用入口执行 `setActivePinia(createPinia())`；确保安装 `pinia` 与 `@vue/devtools-api`（后者为 pinia 必选 peer，v8 无 vue 依赖）。
3. example 补一个 pinia store 用例验证后再对外宣称（对齐设计文档「实测后才可宣称」的约束）。

工作量：**0.5–1 人日**（改导出 0.1 + example 冒烟与边界用例 0.3–0.5 + 文档/changeset 0.2）。

## 7. 风险清单

| 风险 | 等级 | 说明与缓解 |
| --- | --- | --- |
| `hasInjectionContext`/`getCurrentInstance` 语义差异 | 低 | compat 返回精简元信息（无 `.proxy`/`.ctx`），pinia 全部调用点均有守卫（实测 L1370 `currentInstance && currentInstance.proxy`）；若未来 pinia 新增读取 `.app`/`.proxy` 的逻辑需回归 |
| `install(app)` 路径未验证 | 低 | React 下永不走 `install`；但若有人误调 `app.use(pinia)` 传入 mock app，`app.config.globalProperties` 赋值需 mock 支撑——文档注明「不要调用 install」即可 |
| options 式 store（`state/getters/actions`）路径 | 低 | 冒烟覆盖 setup 式；options 式额外使用 `isShallow`（补齐后）与 `mergeReactiveObjects`（pinia 内部实现，无 vue 依赖），理论无缺口，建议 example 一并验证 |
| `@vue/devtools-api` 必选 peer | 低 | 不装会解析失败；v8 与 vue 解耦，安装即无副作用。可在 plugin 的 alias 注入处顺带校验 |
| pinia 版本漂移 | 中 | 本评估锚定 4.1.0；pinia 后续若新增 vue 导入（如回归渲染器 API）需重跑本对照。建议在 plugin 层加「alias 后 import 面」的单测护栏 |
| compat `watch` 长期语义差异（deep/immediate 组合边界） | 低 | 冒烟验证基础回调；`$subscribe` 依赖 pinia 内部 `watch`（flush sync/默认混合），建议对 `$subscribe`/`$onAction` 补一条用例 |
