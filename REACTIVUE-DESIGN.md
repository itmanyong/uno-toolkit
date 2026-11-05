# @uno-pc/reactivue 设计文档

> **状态**：设计评审已完成，全部开放问题已关闭；**按用户要求暂不建包**，本轮交付为决议落档 + §14 性能上限分析
> **日期**：2026-11-04 初稿 / 评审决议修订 / 第二轮（Q8 定案 + §14）
> **适用范围**：uno-toolkit monorepo 新增 package
> **本轮交付范围**：仅设计文件；不含实现代码、不含测试、不含构建结果
> **包名**：`@uno-pc/reactivue`（目录规划 `packages/reactivue/`）
> **文档归属**：按评审决议第 7 条，本文件**常驻仓库根目录**，不随包移入、不同步到 website docs
>
> **评审决议见 §0.1 与 §12；决议与正文措辞冲突时以 §0.1 为准。**
> 文中【已验证】表示已通过仓库源码或上游源码核对；【设计】表示本文件提出的方案；【待确认】表示尚未验证、需在实现阶段核实的点。所有"验收""通过"字样均指**计划中的验收标准**，不代表已执行。

---

## 0. 决策摘要

| # | 决策 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | 运行时基座 | React 19，产出普通 React 组件，可嵌入任意 React 应用 | 用户确认；仓库 catalog 已有 `react`/`react-dom` 19.3.1 |
| 2 | 与 `signals-transform` 的关系 | 零耦合，独立新包，不改造、不复用其 `.value` 静态检测 | 用户确认；它是 `@preact/signals-react` 专用编译插件 |
| 3 | 响应式实现 | **不自研 Proxy**，直接依赖 `@vue/reactivity`，re-export Vue 官方 API（含 `.value` 语义） | 用户要求「类似 reactivue、复用 Vue 生态」；【已验证】reactivue `src/index.ts:20-63` 直接 re-export |
| 4 | setup 执行次数 | `defineComponent` 的 setup **只执行一次**，之后只更新 JSX 内部 | 用户确认 |
| 5 | 三种用户入口 | `<Block>` 组件、`v-memo` 指令、`defineComponent` 封装函数 | 用户确认 |
| 6 | 文本 Block 更新方式 | **T2：锚点 + `effect` 直写 DOM Text 节点**，零 `useSyncExternalStore`、零 React 重渲染 | 用户确认 |
| 7 | 非文本 Block 更新方式 | 走局部 fiber 重渲染，允许使用 `useSyncExternalStore` | 由第 6 条限定范围反推；见 §3.2 |
| 8 | `v-memo` 语义 | **额外触发源**：刷新条件 = 自动收集的响应式依赖 ∪ deps 浅比较变化（非 Vue 原语义） | 用户确认 |
| 9 | 指令命名 | `v-memo`；不使用 `v-block` | 用户确认；不与 `jsx-directive` 现有 `v-*` 指令重名 |
| 10 | Vue 生态复用 | 由插件自动注入 `vue` / `@vue/runtime-dom` alias 到本包 `./compat` 兼容层 | 参考 reactivue README「Using Vue's Libraries」；【设计】省去用户手配 |

**命名的注意点**：npm 上已有 antfu 的 `reactivue` 包。本包带 `@uno-pc/` scope，不冲突；文档与 README 中应说明本包是独立实现、仅参考其 API 形态与生态桥接思路。若后续参考其 `mock.ts` 的实现细节，须遵守其 MIT 许可并保留声明；本设计主张**参考思路、自行实现**，不复制源码。

### 0.1 评审决议（2026-11-04）

| # | 开放问题 | 决议 | 落地章节 |
| --- | --- | --- | --- |
| 1 | DOM 测试环境 | **允许**引入 `jsdom` / `happy-dom` 作为本包 devDependency；采用 §10.1 的 A+B 组合 | §10.1 |
| 2 | hooks 边界 | **接受**「setup 内禁用 React hooks」，不增加 context 桥，不放宽「setup 只跑一次」 | N3 / §9 R1 |
| 3 | 生态兼容范围 | **首版只保证 VueUse 纯组合式函数可用**；pinia 与 `createApp` mock 列入后续规划，不进 P4 验收 | §8.2 / §8.3 / §10.2 / §11 |
| 4 | 无插件降级 | **接受**保留 R4 降级路径，接受由此带来的运行时体积与分支 | §9 R4 |
| 5 | `./internal` 入口 | **走独立 exports 子路径**，不复用主入口的私有导出 | §4.2 / §6.9 |
| 6 | source map | 首版不生成**可接受**，列入后续规划，不进 P0–P4 验收 | §6.12 |
| 7 | 文档归属 | **否**：本文件不随包移入 `packages/reactivue/DESIGN.md`，也不同步到 `apps/website/docs` | §4.1 / §4.3 |
| 8 | Q8 `v-memo` 归属 | **R-A 分层**：语法外壳归 `jsx-directive`，语义降低归 reactivue，两包不建立 import 边 | §4.3 / §5.6 / §6.11 / §13 |
| 9 | 未安装 reactivue 时的 `v-memo` | **编译期报错**，提示安装并注册插件；不告警剥离、不静默通过 | §6.11 / §9 R11 / §13.5 |
| 10 | 建包时机 | **暂不建包**；本轮只做决议落档与性能上限分析（§14） | §14 |

> 第 7 条按「仅指本设计文件」理解：包自身的 README 条目与 website **使用文档页**仍按 §4.3 / P4 保留。若原意是连使用文档页也不做，请纠正。

**Q8 已关闭**（R-A + 报错策略），详见 §13.5。本文件已无未决的开放问题；§14 中标注的【待实现验证】属于实现阶段核对项，不是待用户拍板的决策。

---

## 1. 背景、目标与边界

### 1.1 问题陈述

React 的心智负担集中在「组件函数每次渲染都重跑」及其衍生的 hooks 规则、依赖数组、memo 化。目标是提供一套 Vue Composition API 风格的开发体验：setup 只跑一次、状态用 `ref`/`reactive`/`computed`、无需 `useState`/`useMemo`/依赖数组；同时**不牺牲渲染性能**——状态变化时只更新真正依赖它的最小区域，且**保留 React 生态**（任意 React 组件作为标签、props/children、ref、Portal、Suspense、DevTools、SSR）。

### 1.2 参考实现核对结论

| 项目 | 机制【已验证】 | 更新粒度 | 借鉴 / 不采用 |
| --- | --- | --- | --- |
| **viewfly** | `reactive()` 自研 Proxy + 属性级 WeakMap dep；`computed` 懒计算 + `Object.is` 抑制；`Component.render()` 用 `pushDepContext(listener)` 把整个渲染函数包成**一个 Dep**（`packages/core/src/base/component.ts:139-175`） | 组件级（setup 只跑一次，渲染函数整体重跑） | 借鉴「setup 只跑一次」；**不采用**自研响应式层（改接 Vue） |
| **@preact/signals-react** | 给 `Signal.prototype` 挂 `$$typeof`/`type`/`props`/`ref`，把 signal 伪装成 ReactElement，`type = SignalValue`（`runtime/src/index.ts:381-408`）；`SignalValue` 内 `_useSignalsImplementation(1)` 中确实调用了 `useSyncExternalStore`（`:370`） | 单个最小 fiber | 借鉴「DOM 结构由 React 创建、更新范围收敛到极小」；**不采用**其订阅方式（文本通道改为 effect 直写）。另：其 `wrapJsx` 对非 children 的 DOM 属性直接读 `.value` 且不订阅（`src/index.ts:34-49`），本包需补上属性绑定能力 |
| **reactivue** | `useSetup` 用 `useState(createState)` 让 setup 只跑一次（`src/useSetup.ts:38`）；用 `watch(data, { deep: true, flush: 'post' })` → `setTick()` 触发**整个组件重渲染**（`:101-119`）；props 用 `reactive({...ReactProps})` + `useEffect` 同步（`:17`、`:41-51`）；依赖 `@vue/reactivity`、`@vue/runtime-core`、`@vue/shared` | 组件级重渲染 | **完整借鉴** API 形态、props 桥、生命周期桥、`vue` alias + mock 的生态复用路径；**核心差异**是把整组件重渲染替换为细粒度更新 |

reactivue 的生态复用路径【已验证】：在构建工具里把 `vue` / `@vue/runtime-dom` alias 到兼容层，README 声明 pinia、VueUse、Villus 实测可用；限制是 `getCurrentInstance()` 返回内部状态而非 Vue 实例、`emit()` 不可用、`app.component/directive/mixin` 被跳过。

**关键结论**：viewfly 的自研 Proxy/Dep 整层删除，P0 从「自研响应式内核」降为「接 `@vue/reactivity` 的 `effect` + 生命周期桥 + 实例作用域」，复杂度下降一个量级。

### 1.3 目标

- G1：Vue3 Composition API 开发体验，setup 只执行一次。
- G2：文本绑定零 React 参与；结构/属性绑定收敛到局部 fiber。
- G3：普通 React 组件输出，可混用任意 React 生态组件。
- G4：通过 alias 兼容层复用纯组合式 Vue 生态，**首版以 VueUse 可用为验收线**；pinia 与 `createApp` mock 列入后续规划（评审决议第 3 条）。
- G5：编译转换对 Vite / Rsbuild 开箱可用，用户不手写构建配置。

### 1.4 非目标

- N1：不做自建 renderer、不脱离 React、不 fork React。
- N2：不替代 `signals-transform`/`jsx-directive`/`style-layer`，也不抽公共编译基建（本轮零耦合）。
- N3：不支持在 `defineComponent` 的 setup 内使用 React hooks（见 §9 风险 R1）。
- N4：不追求「整棵 JSX 树绕过 React」，仅文本通道绕过。
- N5：不做虚拟列表、不做跨组件状态持久化等上层能力。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| **setup** | `defineComponent` 传入的函数，创建状态并返回 JSX，全生命周期只执行一次 |
| **宿主组件 / 包装组件** | 编译期生成的 React 组件，负责缓存 setup、同步 props、求值 `v-memo` deps；它会随 React 重渲染重跑，但不重跑 setup |
| **TextBinding** | 文本通道的运行时组件：生成首屏 Text 节点 + 隐藏锚点，并用 `@vue/reactivity` 的 `effect` 直接写 `nodeValue` |
| **Block** | 结构通道的运行时组件：把一段 JSX thunk 提升为独立订阅单元，依赖变化只重渲染该 fiber |
| **动态块** | 编译期从 JSX 中切出的、含响应式依赖的最小可订阅区域 |
| **锚点** | 编译期插入的隐藏空元素，用于在运行时定位 React 创建的 HostText 节点 |
| **revision** | 由最近的 Block 上下文维护的单调计数，`v-memo` deps 变化时递增，用于强制文本通道重新同步 |

---

## 3. 总体架构

### 3.1 分层

```
┌─ 编译期（Rust + tree-sitter + napi）────────────────────────┐
│  TSX 源码 → 识别 setup / 指令 / 动态表达式 → 切块 + 注入 thunk │
│  输出：Vite / Rsbuild 插件（含 vue alias 自动注入）           │
└───────────────────────────┬────────────────────────────────┘
                            │ 转换后的 TSX
┌───────────────────────────▼────────────────────────────────┐
│  运行时（React）                                            │
│   宿主组件：setup 缓存 / props 桥 / v-memo deps 求值        │
│     ├─ TextBinding  ← 文本通道（零 React 更新）              │
│     ├─ Block        ← 结构通道（局部 fiber 更新）            │
│     └─ 生命周期桥 / 实例作用域 / 卸载清理                    │
└───────────────────────────┬────────────────────────────────┘
                            │ effect / stop / scheduler
┌───────────────────────────▼────────────────────────────────┐
│  @vue/reactivity（官方实现，不自研）                         │
│  ref / reactive / computed / effect / ReactiveEffect /       │
│  effectScope / onScopeDispose / toRaw / unref ...            │
└───────────────────────────┬────────────────────────────────┘
                            │ alias: vue / @vue/runtime-dom
┌───────────────────────────▼────────────────────────────────┐
│  ./compat 兼容层：watch、生命周期、createApp、               │
│  getCurrentInstance、inject/provide、nextTick、Vue 语义      │
│  defineComponent（identity）… 供 VueUse / pinia 等使用       │
└────────────────────────────────────────────────────────────┘
```

### 3.2 两类更新通道（本设计的核心）

| | **文本通道 TextBinding** | **结构通道 Block** |
| --- | --- | --- |
| 覆盖内容 | 文本插值、可安全字符串化的表达式 | DOM 属性、条件分支、列表、任意 ReactNode、`<Block>` 包裹区、`v-memo` 区 |
| 更新执行者 | `@vue/reactivity` 的 `effect` 直接写 `Text.nodeValue` | React 重渲染该 Block 的 fiber |
| React 参与 | **零**：无 `useSyncExternalStore`、无 setState、无重渲染 | 局部 fiber 重渲染，允许 `useSyncExternalStore` |
| DOM 结构 | 多一个隐藏锚点元素 | 不变 |
| 主要风险 | React 对 Text 内容的所有权、hydration | fiber 数量、闭包捕获 |

用户第 6 条决策明确只针对「文本的 Block」，因此结构通道仍可使用 `useSyncExternalStore`——它是 React 官方的并发安全订阅原语（防 tearing），signals-react 亦采用。

### 3.3 数据流

```
写入 ref.value / reactive 属性
  → @vue/reactivity 触发对应依赖
  → 文本通道：effect 回调 → node.nodeValue = String(value)
  → 结构通道：effect scheduler → store.bump() → useSyncExternalStore → 仅该 Block 重渲染
  → v-memo：deps 变化 → revision++ → 该块内所有通道重新同步
```

---

## 4. 包结构与仓库集成

### 4.1 目录规划

```
packages/reactivue/
  src/
    index.ts                 主入口：响应式 re-export + defineComponent + Block
    core/
      scope.ts               实例作用域栈（currentInstance / effectScope）
      setup.ts                setup 缓存、props 响应式桥、生命周期调度
      scheduler.ts            批量调度、revision 管理
    react/
      Host.tsx                编译产物的宿主组件运行时
      TextBinding.tsx         文本通道（锚点 + effect 直写）
      Block.tsx               结构通道（局部 fiber 订阅）
      MemoBlock.tsx           v-memo deps 求值与浅比较
      lifecycle.tsx           onMounted/onUpdated/onUnmounted 等桥接
    compat/
      index.ts                vue / @vue/runtime-dom alias 目标
      watch.ts                watch / watchEffect 薄封装
      app.ts                  createApp mock（pinia 等插件注册）
      instance.ts             getCurrentInstance / inject / provide
    plugins/
      vite.ts                 Vite 插件（transform + alias 注入）
      rsbuild.ts              Rsbuild 插件（transform + alias 注入）
    shared/
      native.ts               napi 原生模块加载（沿用现有包写法）
      types.ts  warnings.ts
  native-rust/
    src/reactivue/mod.rs      tree-sitter TSX 转换
    Cargo.toml  build.rs
  types/global.d.ts           JSX 指令属性声明
  tests/
  scripts/build-native.mjs
  rstack.config.ts  tsconfig.json  tsconfig.test.json
  package.json  README.md  AGENTS.md
  # 本设计文档常驻仓库根目录，不随包移入（评审决议第 7 条）
examples/reactivue-all/        演示：渲染次数计数器 + v-memo + VueUse
apps/website/docs/plugins/reactivue.md
.changeset/                    发版变更集
```

### 4.2 `package.json` 关键字段【设计】

```jsonc
{
  "name": "@uno-pc/reactivue",
  "type": "module",
  "exports": {
    ".":        { "types": "./dist/types/index.d.ts", "development": "./src/index.ts",           "default": "./dist/index.js" },
    "./vite":   { "types": "./dist/types/plugins/vite.d.ts",   "development": "./src/plugins/vite.ts",   "default": "./dist/plugins/vite.js" },
    "./rsbuild":{ "types": "./dist/types/plugins/rsbuild.d.ts","development": "./src/plugins/rsbuild.ts","default": "./dist/plugins/rsbuild.js" },
    "./compat": { "types": "./dist/types/compat/index.d.ts",   "development": "./src/compat/index.ts",  "default": "./dist/compat/index.js" },
    "./internal": { "types": "./dist/types/internal/index.d.ts", "development": "./src/internal/index.ts", "default": "./dist/internal/index.js" },
    "./package.json": "./package.json"
  },
  "peerDependencies": {
    "react": ">=19",
    "react-dom": ">=19",
    "@vue/reactivity": ">=3.5",
    "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
    "@rsbuild/core": ">=2.3.0 <3"
  }
}
```

- 与现有三包一致，采用 `sharedLibConfig`（`rstack.lib.config.ts`）+ `sharedTestConfig`，`development` 条件指向源码。
- 【待确认】现有 `rstack.config.ts` 的入口 glob 写作 `"./src/**/*.ts"`；本包含 `.tsx`，入口需覆盖 `.tsx`。具体 glob 写法以 rstack 配置校验结果为准，实现阶段核实后确定，不在此臆断。
- 【待确认】`@vue/reactivity` 版本与 catalog 条目：仓库 `pnpm-workspace.yaml` 的 `catalog` 目前无该依赖，需新增；具体版本在实现时按 `vue` 主版本锁定并写入 catalog，不在本文件写死版本号。
- 【待确认】`watch` 的导出位置：Vue core `main` 分支的 `packages/reactivity/src/index.ts` 已导出 `watch`/`getCurrentWatcher` 等【已验证】，但不同 minor 版本可能不同。本设计**不直接依赖** `watch`：块级订阅统一用 `effect` + `scheduler`；对外的 `watch` 由 `./compat` 做版本探测 + 兜底实现。

### 4.3 与现有包的关系

- 与 `signals-transform`：**零耦合**，不 import、不共享配置、不改其行为。
- 与 `jsx-directive`：**不 import**（硬约束）。本包插件**先于** `jsx-directive` 运行，拿到未展开的原始 JSX 结构再切块。按 **Q8 = R-A**：`v-memo` 的指令名 / TSX 类型 / 值校验 / 文档 / 残留报错归 `jsx-directive`，语义降低（`_MemoBlock` + revision + 切块）归本包；两包之间**只有「源码里还有没有残留 `v-memo` 属性」这一条隐式契约，没有 import 边、没有配置传递**。细则见 §13.5。
- 与 `style-layer`：无关。
- 根 `README.md` 的 Packages 表、`apps/website` **使用文档页**需新增条目（P4 处理）。注意与决议第 7 条区分：不上线的是本设计文件，不是包的使用文档。

---

## 5. API 设计

### 5.1 响应式 API（主入口 re-export）

直接从 `@vue/reactivity` re-export，语义与类型完全一致，不包一层：

```ts
export {
  ref, shallowRef, isRef, toRef, toRefs, toValue, unref, proxyRefs, customRef, triggerRef,
  reactive, readonly, isReactive, isReadonly, isProxy, shallowReactive, shallowReadonly,
  markRaw, toRaw, computed, effect, stop, enableTracking, pauseTracking, resetTracking,
  ReactiveEffect, effectScope, EffectScope, getCurrentScope, onScopeDispose,
} from '@vue/reactivity'
```

`.value` 语义（Vue 官方）原样保留：`ref`、`computed`、`shallowRef` 等均通过 `.value` 读写。viewfly 的 `createSignal()`（`s()` / `s.set()`）**不**作为主 API；如未来需要，可作为可选适配层另行讨论。

### 5.2 生命周期桥【设计】

```ts
function onMounted(fn: () => void): void
function onUpdated(fn: () => void): void
function onUnmounted(fn: () => void): void
function onBeforeMount(fn: () => void): void
function onBeforeUpdate(fn: () => void): void
function onBeforeUnmount(fn: () => void): void
```

由 `useEffect` / `useLayoutEffect` 驱动；注册时机限定在 setup 同步执行期间（实例作用域内），与 Vue 一致。`onUpdated` 的触发来源为「本宿主组件内任一动态块完成更新」，而非 React 组件重渲染——需在文档中明确语义差异。

### 5.3 `defineComponent`【设计】

```ts
type Setup<P> = (props: Readonly<Reactive<P>>) => JSX.Element

function defineComponent<P extends object = {}>(
  setup: Setup<P>,
  options?: { displayName?: string; memoDeps?: (props: P) => unknown[] }
): React.FC<P>
```

行为约定：

1. 返回的仍是**普通 React 函数组件**，`<Counter value={10} />` 可直接使用。
2. setup 全生命周期**只执行一次**（含 props 变化、父级重渲染、StrictMode 稳定后）。
3. setup 内**只能使用本包 API 与 Vue 响应式 API + 返回 JSX**；禁止 React hooks（§9 R1）。
4. `props` 是只读的 `reactive` 对象，props 变化由桥同步写入，不重跑 setup。
5. 返回的 JSX 由编译期切块；未启用编译插件时降级为普通组件级重渲染（§9 R4）。

- **【2026-11-05 实现修订，见 §16.3】** 上述 `Setup<P> = (props) => JSX.Element` 与 R4 降级路径互斥：JSX 在 setup 执行时已把响应式表达式求值成常量，之后无可重新求值的载体。实现把返回类型放宽为 `ReactNode | (() => ReactNode) | { render: () => ReactNode }`，**推荐 setup 返回 render thunk**；编译产物仍是 `{ render }` 形态。返回静态 JSX 且未启用插件时 DEV 告警并降级为静态渲染。

【设计】编译期会把 `defineComponent(() => {...})` 的返回 JSX 重写为块结构，并把 setup 包进 `_Host` 运行时（§6.7）。**运行时的 `defineComponent` 本身不切块**，切块由插件完成；这条边界是「无插件可降级」的前提。

### 5.4 `useSetup` / `createSetup`【设计，兼容 reactivue 形态】

```ts
function useSetup<S extends Record<string, unknown>, P = {}>(
  setup: (props: Readonly<Reactive<P>>) => S,
  reactProps?: P
): UnwrapRef<S>

function createSetup<S, P>(setup: (props: P) => S): (props: P) => UnwrapRef<S>
```

提供给「不想用 `defineComponent`、想在普通 React 组件里用组合式 API」的场景。此时渲染函数仍是普通 React 函数组件，**更新粒度为组件级**（与 reactivue 相同），不享受细粒度优化。文档需明示这一点，避免误用。

### 5.5 `<Block>` 组件【设计】

```ts
function Block(props: {
  children: () => React.ReactNode
  memo?: unknown[]          // 等价 v-memo 的额外依赖
  text?: boolean            // 强制走文本通道（仅当 children 返回 primitive）
}): React.ReactElement
```

包裹区的 children 被抽成独立订阅单元，块内响应式依赖变化时只刷新该块。编译期对 `<Block>` 与 `v-memo` 一视同仁地做切块处理。

### 5.6 `v-memo` 指令【设计】

语法：`v-memo={[a, b]}`，值必须是数组字面量或返回数组的表达式。

语义（按用户确认的「额外触发源」，**非 Vue 原语义**）：

```
块刷新条件 = 自动收集的响应式依赖变化  ∪  deps 逐项 Object.is 比较发生变化
```

- deps 中可放非响应式外部数据（props 字段、外部变量、函数结果等），作为自动收集之外的补充触发源。
- deps 的**求值时机**：编译期把 deps thunk 提升到宿主组件的 render 层（而非 setup 层）。宿主组件会随 props/父级重渲染重跑，因此 deps 能读到最新值；setup 仍不重跑。
- deps 变化 → 该块 `revision++` → 块内 TextBinding 重新同步值、Block 强制重渲染。
- `v-memo={[]}` 在本语义下等价于「仅响应式依赖驱动」，**不等价** `v-once`；如需永久静态，另议 `v-once`（本轮不做）。
- 与 Vue 差异必须在 README 显著位置说明：Vue 的 `v-memo` 是 deps 不变就跳过子树更新（会压制块内响应式更新），本包方向相反。

**TSX 类型声明【已修正】**：React 19 的 `@types/react` 已移除全局 `JSX` 命名空间、改用 `React.JSX`，因此初稿里的 `declare namespace JSX { interface IntrinsicAttributes }` 在 example 中**不会生效**。`jsx-directive` 现有写法（`types/global.d.ts` 中 `declare module "react" { interface Attributes extends JsxDirectiveAttributes {} }`）才是对的路径。

**Q8 = R-A 后定案**：`jsx-directive` 的 `JsxDirectiveAttributes` 为权威定义；本包 `types/global.d.ts` **另写一条同型模块增强** `'v-memo'?: unknown[]`，用一行重复换取零类型依赖（不引入 `@uno-pc/jsx-directive` 作为类型 peer）。接口合并要求两边类型字面量逐字一致，由 P4 `typecheck` 覆盖。不再单独做「`JSX` 命名空间冲突」实测。

### 5.7 用户侧完整示例【设计，目标体验】

```tsx
import { defineComponent, ref, computed, onMounted } from '@uno-pc/reactivue'
import { useMouse } from '@vueuse/core'   // 经 alias 复用 Vue 生态

export const Counter = defineComponent<{ initial: number }>((props) => {
  const count = ref(props.initial)
  const doubled = computed(() => count.value * 2)
  const { x, y } = useMouse()

  onMounted(() => console.log('mounted'))

  return (
    <main>
      <h1>计数：{count.value}</h1>
      <p v-memo={[props.label]}>派生：{doubled.value} / {props.label}</p>
      <div className={count.value > 10 ? 'danger' : 'normal'}>
        鼠标：{x.value}, {y.value}
      </div>
      <button onClick={() => count.value++}>+1</button>
    </main>
  )
})
```

预期行为：点 `+1` 时 setup 不重跑、宿主组件不重渲染；`count` 变化只更新 `<h1>` 的 Text 节点与 `<div>` 的属性块；`doubled` 变化只更新对应 Text 节点；`props.label` 变化（dept 命中）刷新 `<p>` 整块。

---

## 6. 编译期转换规范

### 6.1 目标与边界

编译期只做两件事：**识别并切出动态区域**、**注入 thunk 与运行时调用**。不判断某个标识符是否响应式（Vue 的 Proxy 隐式收集使静态判断既不可能也无必要），依赖判定全部交给运行时 `effect`。

由此带来的关键简化：注入的 thunk 用**闭包**捕获 setup 局部变量，编译期**不需要做自由变量分析**（无需处理 TDZ、赋值、可变变量提升）。代价：setup 只跑一次 → 闭包永不重建 → 非响应式局部变量在 setup 后的赋值对块不可见。这是「setup 内只能用新 API」约束的技术根因，不是风格要求，须在文档与 DEV 警告中写死。

### 6.2 转换规则总表

| 源码形态 | 产物 | 通道 |
| --- | --- | --- |
| `{primitiveExpr}` 文本插值 | `<_TextBinding value={() => primitiveExpr} revision={...} />` | 文本 |
| 属性 `className={expr}` / `style={expr}` / `disabled={expr}` | 整个元素提升为 `<_Block render={() => <div ... />} />` | 结构 |
| 条件 `{cond ? <A/> : <B/>}` | `<_Block render={() => cond ? <A/> : <B/>} />` | 结构 |
| 列表 `{items.map(...)}` | `<_Block render={() => items.map(...)} />` | 结构 |
| 任意 ReactNode 表达式（含组件、Fragment） | `<_Block render={() => expr} />` | 结构 |
| `<Block>...</Block>` | 包裹区整体切为一个 `_Block` | 结构 |
| `<tag v-memo={[a,b]}>...</tag>` | `<_MemoBlock deps={() => [a,b]} render={() => <tag>...</tag>} />` | 结构 |
| `defineComponent(setup)` | `_Host({ setup: () => ..., render: () => <切块后的 JSX> })` | — |

**文本通道的启用条件**（保守）：表达式是标识符、成员访问、可选链、数字/字符串字面量、模板字符串、一元/二元运算、`.value` 读取，且**不含 JSX**、不含函数调用返回值类型不明的复杂情形（函数调用可放行，但运行时仍需兜底，见 §7.4）。静态分析无法判定时一律降级到结构通道。宁可少优化，不可渲染出错。

### 6.3 文本插值 → TextBinding（重点）

源码：

```tsx
<h1>计数：{count.value}</h1>
```

概念性产物（**最终生成代码以实现为准**）：

```tsx
<h1>
  计数：
  <_TextBinding value={() => count.value} revision={_rv.revision} />
</h1>
```

`TextBinding` 的渲染产物（概念）：

```tsx
<>
  {initialText}
  <span ref={_rv.anchorRef} hidden data-rv-anchor="" />
</>
```

设计要点：

- React 渲染 `initialText` 字符串时会创建一个 HostText 节点；紧随其后的隐藏 `<span>` 作为锚点，`anchor.previousSibling` 即该 Text 节点，**无需改变可见 DOM 结构**。
- `initialText` 由 `useState` 初始化一次且**永不更新**。这样父级/宿主组件重渲染时，React 比较 Text 内容「上次 `initialText` vs 本次 `initialText`」相同 → 不会写 DOM → 我们用 `nodeValue` 写入的值得以保留。这是整个 T2 方案自洽的关键。
- 首屏值与 hydration 一致：SSR 时 `useLayoutEffect` 不执行，服务端与客户端都渲染 `initialText` + 隐藏锚点，hydration 匹配；挂载后 effect 接管。
- 【待确认】`hidden` 属性与 `data-rv-anchor` 在 React 19 下的渲染与 SSR 表现、以及 `display:none` 对 `previousSibling` 无影响，需在 example 中实测。

### 6.4 属性绑定

`signals-react` 明确不支持 signal 作为 DOM 属性（其 `wrapJsx` 直接读 `.value` 且不订阅）。本包**支持**：把整个宿主元素提升为 `_Block`，属性表达式在 thunk 内求值，依赖变化只重渲染该元素 fiber。

不采用「ref + `setAttribute` 直写」的原因：React 同时持有该属性的所有权，两方写入会互相覆盖，且事件属性、SVG、受控表单 (`value`/`checked`) 的语义复杂，收益不抵风险。

### 6.5 条件与列表

条件/列表表达式整体作为结构通道的 thunk。列表项内部的动态文本仍按 §6.2 递归切分（列表项 key 由用户代码保留）。首版**不做** keyed 复用优化之外的调度；列表整体依赖变化时重渲染该 Block，属于已知性能边界（§9 R6）。

### 6.6 `<Block>` 与 `v-memo`

`<Block>` 与 `v-memo` 都切出一个结构块；`v-memo` 额外注入 deps thunk。deps thunk **提升到宿主组件 render 层**，示例（概念）：

```tsx
// 源码
<p v-memo={[props.label]}>派生：{doubled.value}</p>

// 产物（deps 在宿主 render 中求值，render thunk 留在 setup 闭包）
<_MemoBlock
  deps={_rv.deps(() => [props.label])}
  render={() => <p>派生：<_TextBinding value={() => doubled.value} revision={_rv.revision} /></p>}
/>
```

`revision` 由最近的 `_MemoBlock` / `_Block` 上下文提供：deps 变化时递增，块内所有 TextBinding 依赖该 revision 重新建立 effect 并立即同步一次值（§7.6），从而解决「文本绕过了 React，deps 变化时如何带动它刷新」。

### 6.7 `defineComponent` 包装（概念）

```tsx
// 源码
const Counter = defineComponent((props) => {
  const count = ref(props.initial)
  return <h1>{count.value}</h1>
})

// 产物
const Counter = _Host({
  setup: (props) => {
    const count = ref(props.initial)
    return {
      render: () => <h1><_TextBinding value={() => count.value} revision={_rv.revision} /></h1>,
      deps: (props) => [],
    }
  },
  displayName: 'Counter',
})
```

`_Host` 负责：`useState` 缓存 setup 结果、props 桥、deps 求值、生命周期调度、卸载清理（§7.2）。**setup 返回的 JSX 被编译成 `render` thunk**，因此 setup 执行一次后，后续更新只调用 `render`/`value` thunk。

### 6.8 完整转换示例（源码 → 概念产物）

源码：

```tsx
const Counter = defineComponent<{ initial: number; label: string }>((props) => {
  const count = ref(props.initial)
  const doubled = computed(() => count.value * 2)
  return (
    <main>
      <h1>计数：{count.value}</h1>
      <p v-memo={[props.label]}>{doubled.value} / {props.label}</p>
      <div className={count.value > 10 ? 'danger' : 'normal'}>状态</div>
      <button onClick={() => count.value++}>+1</button>
    </main>
  )
})
```

概念产物：

```tsx
const Counter = _Host({
  setup: (props) => {
    const count = ref(props.initial)
    const doubled = computed(() => count.value * 2)
    return {
      render: () => (
        <main>
          <h1>计数：<_TextBinding value={() => count.value} revision={_rv.revision} /></h1>
          <_MemoBlock
            deps={_rv.deps(() => [props.label])}
            render={() => (
              <p>
                <_TextBinding value={() => doubled.value} revision={_rv.revision} />
                {' / '}
                <_TextBinding value={() => props.label} revision={_rv.revision} />
              </p>
            )}
          />
          <_Block render={() => <div className={count.value > 10 ? 'danger' : 'normal'}>状态</div>} />
          <button onClick={() => count.value++}>+1</button>
        </main>
      ),
    }
  },
  displayName: 'Counter',
})
```

说明：`<main>` 静态骨架只在 setup 首次执行时创建一次；`<button>` 的 handler 闭包捕获 `count` 这个稳定的 ref 对象，不存在 stale closure。

### 6.9 AST 与编辑策略【设计】

- 沿用仓库现有骨架：Rust + `tree-sitter-typescript`（`LANGUAGE_TSX`）+ napi，插件在其他转换之前运行，处理 `.js/.jsx/.ts/.tsx`（`v-memo` 仅 `.jsx/.tsx`）。
- 解析失败（`tree.root_node().has_error()`）→ 原样返回，不报错（与现有包一致）。
- 编辑策略沿用现有 `Edit { start, end, replacement }` + 逆序 `replace_range`；**嵌套编辑**按区间由内向外处理（现有 `signals-transform/native-rust/src/signals_transform/mod.rs:123-172` 已有可借鉴的嵌套替换实现）。
- 需新增识别：`jsx_expression` 中的表达式类型判定、`jsx_attribute` 的指令名、`defineComponent(...)` 调用及其回调体、`return` 语句中的 JSX、`<Block>` 组件标签。
- 生成标识符需避开源码已有名字（沿用 `unique_identifier` 思路）。
- 自动注入 import：运行时符号从 `@uno-pc/reactivue/internal` 导入（内部入口，不对外暴露）；需在同一次编辑中完成插入位置计算。
- 【已定】`./internal` 作为**独立 exports 子路径**（评审决议第 5 条），见 §4.2。实现阶段核对 rstack 入口 glob 是否覆盖 `src/internal/**` 与 `.tsx`，以及产物路径是否与 exports 声明一致。

### 6.10 跳过与警告

| 情形 | 行为 |
| --- | --- |
| setup 内出现 React hooks 调用 | 保留源码不转换 + 构建期警告（`mode: strict` 下报错） |
| 动态块内含 hook 调用 | 不切块，降级为外层结构块 + 警告 |
| 文本表达式含 JSX / 复杂对象 | 降级到结构通道 |
| `v-memo` 值不是数组 | 保留源码 + 警告 |
| 自定义组件标签上的 `v-memo` | 允许；块包裹整个组件调用 |
| 解析失败 / 不支持的扩展名 | 原样返回，无警告（与现有包一致） |

### 6.11 插件顺序与 alias 注入【设计】

- **顺序**：本包插件先于 `jsx-directive`（先切块，再展开 `v-if`/`v-for` 等）；需在与 `jsx-directive` 共用的 example 中验证两者产物不互相破坏。
- **R-A 残留即报错**：本包插件必须消费掉输入中的**全部** `v-memo`；`jsx-directive` 后跑时若仍看到该属性，按 §13.5 抛出编译期错误「请安装 `@uno-pc/reactivue` 并把其插件注册在 `jsx-directive` 之前」。这条顺序因此从性能优化约定升级为**正确性约定**。
- **alias 自动注入**：Vite 通过 `config()` 合并 `resolve.alias`；Rsbuild 通过 `tools.rspack`/`resolve.alias` 配置。映射：
  ```
  'vue'              → '@uno-pc/reactivue/compat'
  '@vue/runtime-dom' → '@uno-pc/reactivue/compat'
  ```
  **不** alias `@vue/reactivity`（保持官方实现，避免双份响应式实例）。
- 提供 `alias: false` 开关，供用户自行配置或完全关闭 Vue 生态兼容。
- 【待确认】Rsbuild 侧 alias 注入的具体 API 与优先级，以 `@rsbuild/core` 2.3.x 实测为准。

### 6.12 SourceMap 与 HMR

- 首版转换**不生成 source map**（与现有三包一致，`transform` 返回 `{ code, map: null }`），在 README 中标注为已知限制。**评审决议第 6 条已接受，并列入后续规划，不进 P0–P4 验收。**
- HMR：setup 内状态在热更新时的保留策略首版不做（沿用 React Fast Refresh 的默认行为，即组件重挂载）；列为 P4 之后的增强项。

---

## 7. 运行时设计

### 7.1 实例作用域

维护模块级 `currentInstance` 栈（`core/scope.ts`），setup 同步执行期间入栈，供 `onMounted`/`getCurrentInstance`/`inject`/`watch` 使用；每个实例持有 `effectScope()`，卸载时 `scope.stop()` 统一清理所有 effect、computed、watch。参考 reactivue `src/component.ts:52-78` 的作用域思路，但去掉其全局 `window.__reactivue_state` 开发态缓存（改用 React 组件实例本地 ref，避免跨 HMR 的全局状态泄漏）。【设计】

### 7.2 setup 只跑一次【设计】

```ts
const instanceRef = useRef<Instance | null>(null)
if (instanceRef.current === null) {
  instanceRef.current = createInstance(reactProps)   // 同步执行 setup
}
```

- 首选 `useState(() => createInstance(props))[0]` 或 `useRef` 惰性初始化，确保 React 重渲染不重跑 setup。
- **StrictMode 风险**：React 开发态会双调用组件函数体，惰性初始化可能执行两次，产生两份 ref/effectScope。缓解：① setup 约定为「无外部副作用」；② 首次创建的实例在 `useEffect` 中登记，第二次创建的实例在检测到同 id 已存在时丢弃并 `scope.stop()`；③ 提供 DEV 断言检查 setup 执行次数。【待确认】具体以 React 19 StrictMode 实测行为为准（§10 用例）。
- props 变化不重建实例。

### 7.3 props 响应式桥【设计】

- 实例创建时 `const props = reactive({ ...reactProps }) as P`，传给 setup 的是 `readonly(props)`。
- 宿主组件每次 render 时（不是 setup 里）对比 `reactProps` 并同步写入 `props`（`internalWrite` 语义，避免触发写保护）；新增/删除键同样处理。
- props 写入会触发依赖该属性的 Block/TextBinding 更新，与 reactivue `src/useSetup.ts:41-51` 一致但改为同步于 render 阶段（避免 `useEffect` 带来的一帧延迟）。
- **【已修订 2026-11-04，见 §14.4 税 2 / R13】上一句「同步于 render 阶段」的方案作废**：Vue 裸 `effect` 是同步 trigger，在 render 阶段写响应式对象会**在 React 尚未 commit 时直接改 DOM**；React 允许渲染中数据变化时重启/丢弃 render，会留下无法自愈的不一致，StrictMode 下副作用还会跑两遍。改为在 **`useLayoutEffect`** 中同步 props（commit 后、paint 前，无可见一帧延迟），并由 §10.3 的 S8 用例量化多出的一次 commit 往返。**实现时以本条为准。**

### 7.4 TextBinding 细节【设计】

```ts
function TextBinding({ value, revision }: { value: () => unknown; revision: number }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const valueRef = useRef(value); valueRef.current = value
  const [initial] = useState(() => toText(valueRef.current()))  // 非跟踪上下文读取

  useLayoutEffect(() => {
    const node = anchor.current?.previousSibling
    if (!(node instanceof Text)) return
    const runner = effect(() => {
      node.nodeValue = toText(valueRef.current())
    })
    return () => stop(runner)
  }, [revision])

  return <>{initial}<span ref={anchor} hidden data-rv-anchor="" /></>
}
```

要点与边界：

- `initial` 永不变化（§6.3），这是 React 不覆盖我们直写值的前提。
- `effect` 首次执行即写入一次当前值，保证挂载后立刻一致。
- `revision` 变化时清理旧 effect、建立新 effect，并顺带完成一次值同步（§6.6）。
- `toText`：`string`/`number`/`bigint` → `String()`；`null`/`undefined`/`boolean` → `''`（与 React 文本渲染一致）；其它对象 → DEV 下警告并 `String()`（或降级为结构块，二选一，实现阶段定）。
- 初始化读取必须处于**非跟踪上下文**（`pauseTracking` / `resetTracking` 配对），否则会把依赖误收集到上游 effect。
- `node instanceof Text` 检查失败时（如 React 改变了子节点布局、锚点被第三方库移动）→ DEV 警告并停止直写，降级为「该块强制走 Block 通道」【待确认】降级路径的具体实现。
- **不使用** `useSyncExternalStore`、不调用任何 setState。

**【2026-11-05 实现变更，见 §15.3】** 上面的**裸 `effect`（无 `scheduler`）同步写 DOM** 实现被 §15.3 的统一事务调度器取代：文本 effect 改为带 `scheduler`，DOM 写入从「同步栈内」移到「同 task 微任务内」，flush 中须调 `runner()` 重收集依赖。零 `useSyncExternalStore`、零 React 重渲染、锚点方案与 `initial` 不变性**均不变**；`revision`、`toText`、非跟踪初始化、`instanceof Text` 降级等条目继续有效。实现时以 §15.3 为准。


### 7.5 Block 细节【设计】

```ts
function Block({ render, revision }: { render: () => React.ReactNode; revision?: number }) {
  const renderRef = useRef(render); renderRef.current = render
  const store = useMemo(createBlockStore, [])
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  useLayoutEffect(() => {
    const runner = effect(
      () => { renderRef.current() },          // 仅为收集依赖；返回 ReactElement 无 DOM 副作用
      { scheduler: () => store.bump() },      // 依赖变化 → 只重渲染本 Block
    )
    return () => stop(runner)
  })                                          // 无依赖数组：每次重渲染重建依赖集合

  return renderRef.current()
}
```

- 每次 Block 重渲染都重建 effect，以支持**动态依赖**（条件分支读不同 ref 的情况）；代价是多执行一次 `render()`（纯创建 ReactElement）。

**【2026-11-05，见 §15.1 / §15.5】** Vue 内部 `scheduler` 分支**绕过 `isDirty()` 检查**，只要被 notify 就 `bump()`；直接读 `reactive` 属性、数组 `length`、`ITERATE_KEY` 时可能产生「输出未变但仍重渲染」的假阳性。代价上界是 `k·t_r`（输出结构相同时 React 不写 DOM），首版不消除、只量化，见 §15.5。
- `useSyncExternalStore` 提供并发安全的订阅，避免 tearing；server snapshot 固定返回 0，SSR 不建立 effect。
- 结构通道会产生额外 fiber；fiber 数量与切块粒度的权衡见 §9 R5 与 §10.3。

### 7.6 v-memo deps 求值与 revision【设计】

- 宿主组件每次 render 时求值所有 deps thunk，与上一次快照逐项 `Object.is` 比较。
- 变化 → 对应块 `revision++`（`useState` 或 `useRef` + 强制更新），触发：块内 Block 重渲染、TextBinding 重建 effect 并同步值。
- deps 数组长度变化视为变化。
- 浅比较结果未变化时，deps 求值本身仍需执行（因为内部可能含响应式读取），但**不**产生任何更新。
- 【待确认】deps 求值时的响应式读取是否会被误收集到宿主组件的作用域；需在非跟踪上下文执行或显式 `pauseTracking`。

### 7.7 调度与批量【设计】

- 直接使用 `@vue/reactivity` 的 `effect` 默认调度（同步触发）。文本直写是幂等的 DOM 写入，同步执行成本极低。
- 结构通道的 `scheduler` 中把 `store.bump()` 放入微任务队列去重，同一 tick 内多次状态变化只触发一次 Block 重渲染（`core/scheduler.ts`）。
- `computed` 自带的 lazy + 值比较抑制沿用 Vue 实现，不重复造轮子。
- **【已核对 2026-11-04，见 §14.1 / §14.4】** Vue core `effect.ts` 的 `ReactiveEffect.trigger()` 在无 `scheduler` 时直接 `runIfDirty() → run()`；批量由 `startBatch()/endBatch()` 包在**写操作的同步栈内**，`notify()` 只挂 `batchedSub` 链表，没有自动微任务。因此本节的「文本同步」与「结构微任务」是**两条不同步的时钟**，会带来 tearing（R12）与批量边界错位（税 3）。是否给文本通道也加去重、以及混合命中时的对齐策略，按 §14.4 的分流建议 + §10.3 S1/S5 实测确定，**本节不锁定最终调度方案**。

**【2026-11-05 已锁定，见 §15.3】** 上句已被 §15 取代：最终方案为「文本 + 结构共用带 `scheduler` 的 effect + 单一事务 + 微任务 flush（纯文本快路径 / 混合命中对齐 commit）」，`core/scheduler.ts` 按 §15.3 的 `txn` 实现。本节关于「Vue 同步 trigger / React lane 两条时钟」的核对结论仍有效，但两路在运行时被**收束进同一个事务**，不再各自独立提交。

### 7.8 卸载与清理

宿主组件 `useEffect` 清理函数中：`scope.stop()`（清理所有 effect/computed/watch）、调用 `onUnmounted` 钩子、释放实例引用。TextBinding/Block 各自的 `useLayoutEffect` 清理中 `stop(runner)`。确保 StrictMode mount→unmount→mount 循环不残留订阅。

### 7.9 SSR / hydration【设计】

- **SSR**：`useLayoutEffect` 在服务端不执行；TextBinding 渲染 `initialText` + 锚点，Block 用 `getServerSnapshot` 固定值并直接 `render()` 一次输出。响应式写入在服务端无订阅者，符合预期。
- **hydration**：首屏文本由 `initial` 决定，与服务端一致；挂载后 effect 接管并写入当前值。React 19 的 hydration mismatch 检查需实测；如有警告，对锚点/文本容器加 `suppressHydrationWarning`。
- 【待确认】`renderToString` 下 `Text` 全局对象不存在（Node 环境）时的类型守卫处理：`typeof Text === 'undefined'` 时直接跳过 effect 建立。

### 7.10 错误处理【设计】

- setup 抛错 → 由 React 错误边界承接，不在运行时吞异常。
- TextBinding 的 `effect` 回调抛错（如 `value()` 内部报错）→ DEV 下 `console.error` 并 `stop(runner)`，避免无限触发；生产环境静默停止该绑定。
- 转换产物不变量：注入的 thunk 不得包含 React hooks（§6.10 已在编译期拦截）。

---

## 8. Vue 生态兼容层（`./compat`）

### 8.1 alias 表

由插件自动注入（§6.11）：`vue`、`@vue/runtime-dom` → `@uno-pc/reactivue/compat`。`@vue/reactivity` 保持原样。

### 8.2 需提供的 API 清单【设计】

| 类别 | API |
| --- | --- |
| 响应式 | re-export `@vue/reactivity` 全套（含 `effectScope`、`onScopeDispose`、`toValue`） |
| 侦听 | `watch`、`watchEffect`、`onWatcherCleanup`（版本探测 + 兜底实现） |
| 生命周期 | `onMounted`、`onUpdated`、`onUnmounted`、`onBeforeMount`、`onBeforeUpdate`、`onBeforeUnmount`、`onActivated`/`onDeactivated`（no-op 或告警） |
| 实例 | `getCurrentInstance`（返回内部实例元信息，**非** Vue 实例）、`inject`、`provide` |
| 应用 | `nextTick`；`createApp()` mock **列入后续规划、首版不实现**（评审决议第 3 条：先保证 VueUse 可用，pinia 规划） |
| 组件 | Vue 语义的 `defineComponent`（identity 函数）——**注意与主入口的 React 版 `defineComponent` 同名不同义**，`./compat` 必须导出 Vue 语义版本 |
| 其它 | `h`、`Fragment`、`Text`、`Comment` 等符号的 no-op 占位（供类型与运行时探测） |

实现原则：参考 reactivue `src/mock.ts` 与 `src/lifecycle.ts` 的**思路**自行实现，不复制源码（MIT 许可注意事项见 §0）。

### 8.3 已知不兼容（需在 README 明示）

- `emit()` 不可用。
- `app.component` / `app.directive` / `app.mixin` 被跳过并告警。
- 依赖真实 Vue 渲染器（模板编译、`<Transition>`、`<KeepAlive>`、自定义指令）的库不可用。
- `getCurrentInstance()` 返回的不是 Vue 组件实例，读取 `.proxy` / `.ctx` 的库会失败。
- 上游 reactivue README 声明 pinia、VueUse、Villus 可用；本包**首版只以 VueUse 纯组合式函数为实测验收目标**，须在 example 中实际验证后才能对外宣称；pinia / Villus 列为规划，不得照搬上游结论。

---

## 9. 风险与降级矩阵

| ID | 风险 | 影响 | 缓解 / 降级 |
| --- | --- | --- | --- |
| R1 | **React hooks 在 setup 内不可用**：setup 只跑一次，hooks 依赖每次渲染固定顺序调用；`useContext`、`useNavigate`、`useQuery` 等生态 API 失效 | 「完全复用 React 生态」打折扣 | 编译期检测 + 警告；提供生命周期桥与 `inject/provide` 替代；普通 React 组件（setup 之外）仍可正常使用 hooks。若需 context，后续提供 `<UseReact/>` 桥（本轮不做）；**【已确认】评审决议第 2 条接受此边界，不增加 context 桥** |
| R2 | **React 对 Text 节点的所有权**：父级重渲染可能用旧 `initial` 覆盖直写值 | 显示回退 | `initial` 永不变化（§6.3 / §7.4）；DEV 下加 MutationObserver 自检（可选）；异常时降级到 Block 通道 |
| R3 | **hydration mismatch** | 首屏警告 / 覆盖 | SSR 与客户端都渲染 `initialText`；必要时 `suppressHydrationWarning`；实测验证 |
| R4 | **无编译插件时** | 退化为普通组件级重渲染 | `defineComponent` 运行时保留降级路径（用 `useSetup` + 组件重渲染），保证功能正确、仅性能下降；README 明确「性能优化依赖插件」；**【已确认】评审决议第 4 条：保留降级路径，接受额外运行时体积与分支** |
| R5 | **fiber 数量爆炸**：每个动态表达式一个 Block 可能反超收益 | 性能倒退 | 默认按连续动态区域聚合；`v-memo`/`<Block>` 作为手动合并旋钮；benchmark 定阈值；必要时提供 `granularity` 编译选项 |
| R6 | **列表整体重渲染** | 大列表性能一般 | 首版不做 keyed 细粒度调度，文档标注为已知边界 |
| R7 | **StrictMode 双调用** | setup 执行两次、状态泄漏 | 幂等初始化 + 丢弃重复实例 + `scope.stop()`；DEV 断言 |
| R8 | **deps 求值在非跟踪上下文** | 误收集依赖导致无效刷新 | `pauseTracking` 包裹；单测覆盖 |
| R9 | **`vue` alias 全局影响** | 用户代码中其它 `import 'vue'` 被重定向 | 提供 `alias: false` 开关；文档说明作用域 |
| R10 | **`@vue/reactivity` 版本差异**（`watch` 导出位置、`effect` 选项签名） | 运行时 API 不兼容 | 锁定最低版本并写入 catalog；块订阅只用 `effect` + `scheduler` 这两个稳定 API；compat 层做版本探测 |
| R11 | **未安装本包时残留 `v-memo`** | 属性流到 DOM 触发 React 未知道属性警告，且无响应式语义 | Q8 决议第 9 条：`jsx-directive` 白名单加入 `memo` 并在残留时**编译期报错**，提示安装 + 注册顺序；见 §13.5 |
| R12 | **双重时序 tearing**：文本通道同步写 DOM、结构通道经微任务 + React lane 调度 | 同一次写入出现「文本已变、属性未变」的中间帧；Transition 下结构块会重启为 blocking，但**文本已直写且不可回滚** | **【2026-11-05 修订】** §15.3 统一事务调度器：纯文本微任务快路径 / 混合命中挂起到结构块 commit 同帧落地；详见 §15.2 / §15.3、§10.3 S5/S7/S11 |
| R13 | **render 阶段副作用**：§7.3 在宿主 render 阶段同步写 `reactive(props)`，同步 trigger 会直改 DOM | 并发渲染重启/丢弃该次 render 时留下 React 无法自愈的不一致；StrictMode 双跑副作用 | props 同步移到 `useLayoutEffect`（commit 后、paint 前，无可见一帧延迟）；§7.3 / §7.7 据此修订。详见 §14.4 税 2 |

---

## 10. 测试策略与验收标准

### 10.1 环境约束【已验证 / 决议已定】

根 `rstack.test.config.ts` 的 `testEnvironment` 为 `"node"`。**评审决议第 1 条已允许新增 DOM 测试依赖**，因此采用 **A + B 组合**：

- **A（可回归）**：为本包新增 `jsdom` 或 `happy-dom` devDependency，在**本包** `rstack.config.ts` 中覆盖 `testEnvironment`，不修改根 `rstack.test.config.ts` 以免影响其它包。覆盖用例：TextBinding 的 `nodeValue` 直写、锚点定位、父级重渲染不覆盖、Block 重渲染次数、StrictMode 清理、SSR 输出。
- **B（真实表现）**：`examples/reactivue-all` 中用渲染次数计数器 + `MutationObserver` 做浏览器冒烟。
- **纯逻辑测试**（转换产物字符串、响应式依赖收集、deps 浅比较、setup 执行次数）仍在 node 环境跑现有 `rstack/test`。
- 【待确认】`jsdom` vs `happy-dom` 的选型、包级 `testEnvironment` 覆盖在 rstack 中的具体写法 —— 实现阶段实测确定；此项**不再需要用户授权**。

### 10.2 分阶段用例（均为计划，未执行）

| 阶段 | 关键用例 | 验收标准 |
| --- | --- | --- |
| **P0 运行时核心** | `ref`/`reactive`/`computed` 依赖收集；`effect` + `scheduler` 只通知命中块；`effectScope` 卸载清理；props 桥同步；deps 浅比较 | 单测全绿；`setup` 执行次数断言恒为 1；`typecheck` 通过 |
| **P1 文本通道** | 锚点定位到 HostText；写入 `ref.value` 后 `nodeValue` 立即更新；**React 渲染次数不增加**；父级重渲染后直写值不被覆盖；SSR 输出首屏值；StrictMode 不残留订阅 | DOM 测试 + example 冒烟 |
| **P2 结构通道 + defineComponent** | 属性/条件/列表块独立刷新；动态依赖（条件分支读不同 ref）能重新收集；host 卸载 stop 所有 effect；`useSetup` 降级路径 | DOM 测试；断言无关 Block 的渲染次数为 0 |
| **P3 编译期切块** | 文本/属性/条件/列表/`<Block>`/`v-memo`/嵌套组件的转换快照；hooks 检测与警告；解析失败原样返回；嵌套编辑不丢代码；与 `jsx-directive` 共存 | transform 字符串快照单测 + Rust `cargo test` |
| **P4 集成** | Vite/Rsbuild 插件注册与 alias 注入；TSX 类型声明按 §13 结论落地；example 渲染次数计数器；**VueUse 纯组合式函数实际可用**（pinia 列为规划，不进验收）；文档 + changeset | `build`/`test`/`typecheck`/`lint` 全绿；example 手工冒烟 |

### 10.3 Benchmark 方案【设计】

> 本文件不给出**实测**性能数字；§14 给的是成本模型与准入判据，结果由本节用例在 P4 填充并写回文档。

**对照组**（`examples/reactivue-all` 内等价计数器）：

1. 原生 React `useState` —— 基线；
2. `reactivue` 原版 —— 代表「只换 API、不换更新粒度」；
3. `@preact/signals-react` —— 代表 T1 最小 fiber 路线（现有 example 已有实现）；
4. `@uno-pc/reactivue` —— 本包。

**场景矩阵**：

| ID | 场景 | 主要观测 |
| --- | --- | --- |
| S1 | 单文本高频写入（1k 次/秒） | 文本同步路径、批量策略（§14.4 税 3） |
| S2 | 大组件 `N≈500` fiber，仅 1 个动态文本 | `N→1` 的收益上限 |
| S3 | 全量更新（`k≈N`） | 调度扇出是否 regress（§14.5） |
| S4 | 1k 项 keyed 列表 | R6 边界、内存、fiber 数 |
| S5 | 同一次写入同时命中文本 + 属性块 | tearing / 帧内一致性（R12） |
| S6 | SSR 输出 + hydration | 锚点字节、hydration 耗时、首屏值一致 |
| S7 | `startTransition` / Suspense 下重复 S5 | 并发渲染下的时序窗口 |
| S8 | 父级传入新 props 驱动更新 | §14.4 税 2 的 `useLayoutEffect` props 桥是否多一次 commit |
| S9 | 同一事件内连续 10 次写，分「同值」「异值」两组 | DOM 写次数与 MutationObserver 记录数（验证 §15.3 去重 / 值抑制） |
| S10 | 动态依赖切换（条件分支先后读不同 ref） | `runner()` 重收集后订阅集合是否正确、旧 dep 是否残留 |
| S11 | `startTransition` 下重复 S5，并增加「结构块在并发渲染中被丢弃 / 卸载」分支 | React restart 次数、blocking 降级次数、帧内一致性、最坏延迟帧数，以及文本写入是否饿死（§15.3 兜底） |
| S12 | `k≈N` 下切换 `granularity` 三档 | `C_rv / C_react` 曲线，拟合 `c_b / t_r` 与 `D_max` |

**指标**：组件 render 次数（Profiler `onRender` / 计数器）、commit 耗时（`actualDuration` + `performance.now()` 采样）、DOM 变更节点数（`MutationObserver`）、长任务数 / INP、堆内存、SSR HTML 字节数，以及 S5/S7/S11 的**帧内一致性**。**【2026-11-05 补充，见 §15.7】** 帧内一致性的可测量定义：收集一次写入后到下一帧 `requestAnimationFrame` 之间的全部 MutationObserver 记录，若 `characterData` 与 `attributes` 记录未落在同一 rAF 区间即计为一个不一致帧；S9 额外记录 DOM 写次数，S11 额外记录 restart 次数。

**判定**：见 §14.6 准入门槛与 §15.7 补充判据；结果用于定 R5 的切块聚合阈值（三个常数的定义见 §15.4）。**必须在生产构建 + 关闭 StrictMode 的环境下取数**，开发态数据单独记录、不参与判定。

---

## 11. 分阶段计划（里程碑）

| 阶段 | 内容 | 产出 | 验证 |
| --- | --- | --- | --- |
| **P0** | 建包骨架、`@vue/reactivity` 接入、实例作用域、setup 缓存、props 桥、调度器 | 包目录 + runtime 核心 + 单测 | `test` / `typecheck` |
| **P1** | `TextBinding`（T2 锚点直写）、SSR 降级、StrictMode | 文本通道 | DOM 测试 + example |
| **P2** | `Block`、`_Host`、生命周期桥、`useSetup`/`createSetup` 兼容入口 | 结构通道 + `defineComponent` | DOM 测试 |
| **P3** | Rust/tree-sitter 转换器、`v-memo`、`<Block>`、hooks 检测；**`jsx-directive` 侧 R-A 外壳**（白名单、类型声明、值校验、`error` 级别与残留报错） | `native-rust` + 两包转换单测 | `cargo test` + 快照 + 两插件共存用例 |
| **P4** | Vite/Rsbuild 插件（含 alias）、`./compat`、`./internal` 独立子路径、`types/global.d.ts`、example（VueUse 实测）、文档、changeset；**不做 source map** | 完整可发布包 | 全量 `build`/`test`/`typecheck`/`lint` + 冒烟 |

每个阶段独立验证后再进入下一阶段；任一步失败先定位根因，不做叠加补丁。**实际落地状态见 §16。**

---

## 12. 开放问题闭环

原 7 项开放问题已于 2026-11-04 全部关闭，完整决议见 **§0.1**；下表只保留状态与影响面。

| # | 问题 | 状态 | 决议落点 |
| --- | --- | --- | --- |
| 1 | DOM 测试环境 | 关闭（允许） | §10.1 |
| 2 | hooks 边界 | 关闭（接受） | N3 / §9 R1 |
| 3 | 生态兼容范围 | 关闭（VueUse 优先，pinia 规划） | §8.2 / §8.3 / §10.2 / §11 |
| 4 | 无插件降级 | 关闭（保留） | §9 R4 |
| 5 | `./internal` 入口 | 关闭（独立 exports 子路径） | §4.2 / §6.9 |
| 6 | source map | 关闭（首版不做，后续规划） | §6.12 |
| 7 | 文档归属 | 关闭（否，常驻根目录） | §4.1 / §4.3 |
| 8 | Q8 `v-memo` 归属 | 关闭（R-A 分层） | §4.3 / §5.6 / §6.11 / §13.5 |
| 9 | 未安装本包时的 `v-memo` | 关闭（编译期报错） | §6.11 / §9 R11 |
| 10 | 建包时机 | 关闭（暂不建包） | §14 |

第二轮评审已关闭 Q8 及后续两问；**本文件已无待拍板的开放问题。** §15.8 的 P-A / P-B 已于 2026-11-05 拍板（P-A 接受、P-B 首版就做），并随初始架构包落地，见 §16。 R-A 不改动 §6.2 / §6.6 / §7.6 的降低逻辑与 `revision` 语义，只把「名字 / 类型 / 校验 / 文档 / 残留报错」这层外壳移到 `jsx-directive`。

---

## 13. `v-memo` 归属（Q8 已定：R-A 分层）

### 13.1 核对结论：`jsx-directive` 是纯语法展开层，零运行时

【已验证】`packages/jsx-directive/src/index.ts` 只导出插件、`transformDirectives`、`reportWarnings` 与类型，**没有任何 React 组件或运行时导出**；Rust 侧所有指令都降级为普通 JSX/JS 表达式，不注入 import：

| 指令 | 产物（`native-rust/src/jsx-directive/mod.rs`） | 引入运行时 |
| --- | --- | --- |
| `v-if` / `v-else` | 三元链（`build_conditional`，:535） | 否 |
| `v-for` | `iterable.map(...)`（`wrap_for`，:727） | 否 |
| `v-show` | `style={{ [prop]: cond ? a : b }}`（:1196-1225） | 否 |
| `v-html` / `v-text` | `dangerouslySetInnerHTML` / `children={expr}`（:1134-1143） | 否 |
| `v-bind` / `v-model` | 属性展开 / `value` + `onChange`（:1100-1132） | 否 |

另外两处源码事实：`has_directive_candidate`（:168-182）是**硬编码白名单** `{if, else-if, else, show, html, text, for, bind, model}`，只含 `v-memo` 的文件会被 `:122-127` 直接跳过、原样返回；`render_opening_element` 对未知 `v-*` 后缀不产生 `Edit`，属性会原样流到 React（触发未知 DOM 属性警告）。TSX 类型走 `declare module "react" { interface Attributes extends JsxDirectiveAttributes {} }`（`types/global.d.ts`）。

### 13.2 为什么不能整体搬过去

用户已确认的 `v-memo` 是「**额外触发源**」语义（§0 决策 8），它需要三件 `jsx-directive` 模型里不存在的东西：

1. **运行时组件**：`_MemoBlock` 要持有 deps 快照、`revision` 计数与订阅。若 `jsx-directive` 直接发出 `import { _MemoBlock } from '@uno-pc/reactivue/internal'`，就从「通用指令包」反向依赖「特定响应式框架包」，且未安装 reactivue 的工程会直接编译失败。
2. **整棵子树提升为 thunk**：`v-memo` 要把 `<tag>...</tag>` 包进 `render={() => <tag>...</tag>}`，并与 §6.2 的文本/属性/条件切块**交错进行**（`render` thunk 内部还需继续切出 TextBinding）。这是 reactivue 的「切块」变换，不是 `jsx-directive` 的「属性/兄弟节点 desugar」变换。
3. **revision 必须穿透文本通道**：T2 的 TextBinding 用 `effect` 直接写 `nodeValue`，**完全绕开 React 渲染**。`React.memo` 或任何 React 层的「跳过子树更新」都管不到它 —— 一个脱离 reactivue 的纯 React `v-memo` 既不能压制、也不能强制这些文本绑定刷新。

**结论**：在保持「额外触发源」语义的前提下，`v-memo` **无法脱离本架构独立实现**。若坚持完全搬家，必须把语义改回 Vue 的「deps 不变则跳过更新」，且该能力对文本通道无效。

另有一处设计前置缺口：§7.6 的 `revision` 由宿主 / `_MemoBlock` 上下文提供，但现有设计未定义 `v-memo` 出现在 `defineComponent` **之外**（普通 React 组件）时 revision 从何而来；无论选哪条路线，实现前都要补上。

### 13.3 可选路线

| | **R-A 分层（已选定）** | R-B 完全集中 | R-C 双指令拆分 |
| --- | --- | --- | --- |
| 做法 | `jsx-directive` 管**语法外壳**（名字白名单、TSX 类型、值校验、文档、遗留节点清理）；reactivue 管**语义降低**（`_MemoBlock` + revision + 切块） | `jsx-directive` 直接发出 `_MemoBlock` 调用，运行时由可配置 `memo.target` 指向 | `v-memo` 归 `jsx-directive`（Vue 语义、纯 React memo、独立可用）；reactivue 的「额外触发源」另起 `v-deps` |
| 跨包 import | **无** | 有（需 optional peer + 未安装时降级） | 无 |
| 插件顺序 | 不变：reactivue 先跑并消费 `v-memo`；jsx-directive 后跑，**残留即编译期报错**（§13.5） | **需翻转**：reactivue 必须后跑才能切 `render` thunk 内部 | 不变 |
| 语义 | 保持用户已确认的「额外触发源」 | 保持 | 改名；两个语义并存需文档强区分 |
| 改动面 | 小：§4.3 / §5.6 / §6.11 + `jsx-directive` 三处 | 大：两包 Rust 变换都改、顺序耦合、类型依赖 | 中：命名决策 9 需重开 |

**R-A 的契约（已定，不产生依赖边）**：唯一通信是「源码里是否还残留 `v-memo` 属性」——reactivue 插件先跑并消费全部 `v-memo`，`jsx-directive` 后跑时看不到该属性即正常放行；看到则报错。**没有 import 边、没有配置传递、没有跨包 API 调用。** 这样「指令名、类型、文档集中在一处」的诉求被满足，降低逻辑仍留在唯一知道 `revision` 上下文的地方。选项与报错细则见 §13.5。

### 13.4 顺带修正

§5.6 初稿的 `declare namespace JSX { interface IntrinsicAttributes }` 在 React 19 下不生效（`@types/react` 已迁到 `React.JSX`）。R-A 下由 `jsx-directive` 的 `Attributes` 模块增强提供权威定义，本包另写一条**完全同型**的模块增强以换取零类型依赖；两边字面量必须逐字一致，接口合并才安全。

### 13.5 已确认决议与契约细则

**Q8 = R-A 分层**；**未安装 reactivue 时编译期报错**，提示安装并注册插件（不是告警剥离、不是静默通过）。

**机制（靠「残留即错误」自洽，不需要跨插件通信）**：

1. `has_directive_candidate`（`mod.rs:168-182`）白名单加入 `memo`。否则只含 `v-memo` 的文件会被 `:122-127` 早退跳过，错误根本报不出来。
2. `DirectiveTransformOptions` 新增 `memo?: 'error' | 'preserve'`，**默认 `'error'`**：transform 输入中仍存在 `v-memo` 属性 → 产出一条 error，插件侧 `throw`。文案示例：
   `[jsx-directive] v-memo requires @uno-pc/reactivue. Install it and register ReactivueVite() before JsxDirectiveVite().`
3. reactivue 插件**先于** `jsx-directive`（§6.11）并消费掉全部 `v-memo`；此时 `jsx-directive` 的输入已无该属性，早退或正常展开其它指令，不报错。
4. `'preserve'` 仅供「自行处理 `v-memo` 的下游工具链」显式关闭报错，不暴露给终端用户。
5. 值校验：`v-memo` 必须是数组字面量或返回数组的表达式；非数组在 reactivue 侧按 §6.8 保留源码 + 警告。

**实现改动点（R-A 的真实成本，上一轮未计入）**：

- `jsx-directive`：`DirectiveTransformOptions` / `NativeDirectiveTransformOptions` 加字段；Rust 白名单 + `render_opening_element` 识别 `memo` 后缀；`src/core/types.ts` 与 `types/global.d.ts` 的 `JsxDirectiveAttributes` 加 `'v-memo'?: unknown[]`；README 指令表加一行。
- **现有警告通道只有 `warnings: Warning[]` + `reportWarnings`，没有 error 级别**。需给 `TransformResult` 加 `errors` 字段或给 `Warning` 加 `level`，Vite / Rsbuild 插件侧把 error 转成 `this.error(...)` / `api.logger.error` + throw。这是跨两个插件文件的改动，P3 需覆盖。
- reactivue：`types/global.d.ts` 写一条与 `jsx-directive` 完全同型的模块增强，换取零类型依赖；P4 `typecheck` 覆盖。

**R-A 不改动的部分**：§6.2 / §6.6 / §7.6 的降低逻辑、`_MemoBlock` 与 `revision` 语义、插件顺序均保持原设计。

**仍需补的前置缺口**（§13.2）：`v-memo` 出现在 `defineComponent` **之外**时 `revision` 由谁提供，实现前必须定义。建议提供默认 `RevisionContext.Provider` 包住 `_Host`，让裸用场景也有 revision 源。

---

## 14. 性能上限分析（运行时 + 编译时双重时序）

> **状态**：设计推导，**非实测**。文中所有数字均为量级推理或**准入判据**，不是 benchmark 结果；实测数据须由 §10.3 的 P4 用例填充。本轮不建包、不跑任何性能测试。
>
> **后续修订**：§15（2026-11-05）对本章 §14.1 / §14.4 税 1 / 税 3 作了源码级精确化与部分修订；**冲突处以 §15 为准**。


### 14.1 先定义「双重时序」

| 时序 | 发生时点 | 决定了什么 |
| --- | --- | --- |
| **编译期**（一次） | 构建 | setup 只跑一次；JSX 被切成常驻单元；每个动态点固化为一个 fiber + 一个 `ReactiveEffect` + 一个 thunk 闭包 + （文本）一个隐藏锚点 |
| **运行期**（每次写） | `ref.value = x` | 两套调度器并行：① `@vue/reactivity` 同步 trigger → 文本通道同步写 `nodeValue`；② 结构通道 `scheduler` → 微任务去重 → `useSyncExternalStore` → React lane 调度 → render → commit |

【已验证】Vue core `packages/reactivity/src/effect.ts` 的 `ReactiveEffect.trigger()`：无 `scheduler` 时直接 `runIfDirty()` → `run()`，即**同步执行**；`notify()` 只把 effect 挂进 `batchedSub` 链表，批量由 `startBatch()/endBatch()` 包在**写操作的同步调用栈内**完成，没有自动微任务队列。所以 §7.7「文本直写同步触发」成立，而「结构通道放微任务去重」是我们外加的第二条时钟 —— **两条时钟不同步，这是双重时序全部矛盾的来源**。

**【2026-11-05 精确化，见 §15.1】** 批量边界应精确到「单次 `trigger()` 调用」：`dep.ts` 的 `Dep.notify()` 与 `trigger()` 各包一层 `startBatch()/endBatch()`，嵌套 depth 归零时 `endBatch()` 遍历 `batchedSub` 逐个调用 `ReactiveEffect.trigger()`；**有 `scheduler` 时无条件调 `scheduler()`，绕过 `isDirty()` 检查**。因此 10 次写 = 10 次独立 flush。§15 还据此把「文本裸 effect / 结构微任务」两条时钟收束为单一事务，**本节与 §14.4 的定性描述凡与 §15 冲突，以 §15 为准**。


React 侧约束同样明确【已验证，react.dev/learn/keeping-components-pure】：*"React's rendering process must always be pure. Components should only return their JSX, and not change any objects or variables that existed before rendering"*，并说明 *"If some data changes in the middle of rendering a deep component tree, React can restart rendering without wasting time to finish the outdated render"*。

### 14.2 成本模型

符号：`N` = 组件树 fiber 数；`k` = 一次写入命中的动态块数；`d` = 命中绑定的依赖链长度；`t_r` = 单 fiber reconcile；`t_dom` = 单次 DOM 写；`t_s` = 一次 React 调度固定开销；`P` = 样式计算 / layout / paint。

| 路径 | 单次更新 CPU 成本 | 驱动方 |
| --- | --- | --- |
| 原生 React（状态在根） | `t_s + N·t_r + k·t_dom + P` | React lane |
| 本包 · 文本通道 T2 | `d·t_trigger + t_dom + P` | Vue 同步 trigger |
| 本包 · 结构通道 | `t_s + k·t_r + k·t_dom + P` + snapshot 检查 | 微任务 → React lane |
| `@preact/signals-react` 文本 | `t_s + 1·t_r + t_dom + P` | 最小 fiber + `useSyncExternalStore` |

**收益 = 把 `N` 换成 `1` 或 `k`。** 文本通道彻底消掉 `t_s` 与 `N·t_r`；结构通道只把 `N` 降到 `k`。

但 **`P`（浏览器样式计算 / layout / paint / composite）四条路径完全相同**，`nodeValue` 写入照样触发重排重绘。端到端帧时间受 Amdahl 约束：

```
加速比 <= 1 / ((1 - p) + p / S)
p = JS 侧占单帧耗时的比例，S = JS 侧加速倍数
```

例：若 JS 只占 30% 帧时间，即使 JS 侧完全免费（`S → ∞`），整帧也只提速约 **1.43×**。**这套架构优化的是 React 的 JS 开销，不是浏览器的渲染开销** —— 这是评估「能做到什么效果」时最容易被高估的一条。

### 14.3 分层结论：能到什么水平

| 维度 | 可达效果 | 天花板由什么决定 |
| --- | --- | --- |
| **纯文本高频更新**（计数器、实时行情、输入回显、数字动画） | JS 侧 `O(N) → O(1)`，接近 `el.nodeValue = x` 的原生下限，形态上等同 Solid / Svelte 编译产物的文本绑定 | `d·t_trigger`（Proxy dep 遍历）+ 一次 DOM 写 + `P`。**这是本架构唯一能突破 React 上限的部分** |
| **结构更新**（属性、条件、列表、任意 ReactNode） | 最多等价于「手工把组件拆到极致 memo + 精准 selector」 | 仍是 React render + reconcile + commit，`useSyncExternalStore` 还多一次 snapshot 检查，**不可能超过 React 本身** |
| **setup 只跑一次** | 省掉重复执行用户 render 逻辑、派生计算、临时对象分配 | 对重计算组件收益大；轻量组件收益 ≈ 0，而切块固定成本照付 |
| **项目整体** | ≈ `被本包覆盖的更新路径占比 × 该路径 JS 侧加速` | 路由、UI 库、context provider、其它普通 React 组件该怎么渲染还怎么渲染。**若 90% 交互落在原生 React 组件上，项目级几乎无感** |

一句话：**不是全编译框架，因为 DOM 所有权仍归 React**；文本通道能到原生级，结构通道只在 React 上限内做收敛，项目级收益取决于覆盖率与 JS 占帧比。

### 14.4 双重时序要付的四笔「性能税」

**税 1 · tearing / 跨通道不一致（正确性反过来吃性能）**

同一次写入若同时命中文本绑定和结构块：文本在写语句内同步改完 DOM，结构块要等微任务 → React 调度 → commit，出现「数字变了但 className 没变」的中间帧。要修就得把文本通道也对齐到 React commit，T2 就从纯 `O(1)` 退化成 `O(1)` + 一个同步点。

**【2026-11-05 修订，见 §15.2 / §15.3】** 「`startTransition` / Suspense 下窗口可任意长」不成立：React 对 `useSyncExternalStore` 在 Transition 下会**二次调用 `getSnapshot`**，不一致则重启为 blocking update，结构通道自带 anti-tearing；真正的问题是**文本通道不在 store 管辖内、已写入 DOM 的值不可回滚**。因此「编译期标注依赖集合后运行时分流」的方案作废 —— 无需标注，改为 **§15.3 的统一事务调度器**：所有通道共用带 `scheduler` 的 effect，微任务 flush 时已收齐本次写入命中的全部块；纯文本走零 React 快路径，混合命中把文本挂起到结构块 commit 的 layout effect 同帧落地。


**税 2 · §7.3 props 桥在 render 阶段写响应式对象（设计缺陷，需改）**

现设计把 `reactive(props)` 同步放到宿主组件 **render 阶段**，理由是不想付 `useEffect` 的一帧延迟。但同步 trigger 会在 render 期间直接改 DOM，而 React 明确允许「渲染中数据变化时重启 / 丢弃这次 render」—— 一旦重启，DOM 已变而 fiber 仍是旧的，**留下 React 无法自愈的不一致**；StrictMode 双调用还会把这个副作用跑两遍。

**建议**：props 同步移到 `useLayoutEffect`（commit 之后、浏览器 paint 之前，**没有可见的一帧延迟**，同时满足 purity；设计里担心的一帧延迟来自 passive `useEffect`，不是 layout effect）。代价是 props 变化会多一次 commit 往返，由 §10.3 的 S8 用例量化。§7.3 / §7.7 据此修订。

**税 3 · 批量边界不对齐**

Vue 的批量是「一次写操作的同步栈内」，React 的批量是「lane 级、可跨事件」。一个事件里连续写 10 次：文本通道会写 10 次 `nodeValue`（幂等，但仍是 10 次 DOM API + 10 条 MutationObserver 记录），结构通道只 render 一次。给文本通道加微任务去重能省下 9 次 DOM 写，却会把「同步 `O(1)`」变成「微任务 `O(1)`」，并进一步拉大与结构通道的错位窗口。**【2026-11-05 定稿，见 §15.3 / §15.4】** 上句「二选一」已被统一事务方案取代：采用「文本 + 结构共用带 `scheduler` 的 effect + 单一事务 + 微任务 flush（纯文本快路径 / 混合命中对齐 commit）+ `Object.is` 值抑制」。微任务位于同 task 的 paint 之前，且利用 §15.1「10 次写 = 10 次 `endBatch` 但只注册 1 个微任务」天然合并成 1 次（同值则 0 次）DOM 写；flush 时又能看到完整命中集合，撕裂一并解决。**不再需要 S1 实测后二选一**，S1 / S9 改为验证该实现的去重次数与延迟是否达标。


**税 4 · 编译期摊薄带来的固定成本与开发态噪声**

编译期把「一次渲染」摊成「一次 setup + N 个常驻订阅」，固定成本包括：每个动态点 1 个 fiber、1 个 `ReactiveEffect`、1 个 thunk 闭包，文本再多 1 个 `<span>` 锚点；`Block` 每次重渲染还要 `stop` + 重建 effect 并多跑一次 `render()` 收集依赖（§7.5）。StrictMode 下这些全部双份，DEV 还叠 `pauseTracking` / `instanceof Text` 检查。**开发态性能数据不能用于判断生产收益**，且泄漏风险会逼我们加额外幂等逻辑。

### 14.5 会输的场景（准入前必须验证不 regress）

| 场景 | 为什么可能比原生 React 慢 |
| --- | --- |
| 小组件（`N ≲ 10` fiber） | 每块一个 fiber + effect + 锚点 + 闭包的固定成本反超省下的 reconcile |
| 一次写入命中大量块（主题切换、全量数据替换，`k → N`） | N 个 `useSyncExternalStore` 各自调度，扇出成本高于一次整组件 render |
| 长列表（1k 项）keyed diff | 列表仍由 React reconcile；每项一个 Block 会让 fiber 数与内存翻倍（与 R6 一致） |
| 只改结构、不改文本 | 两套调度器都付了，却没吃到文本通道的零成本 |
| SSR / hydration | 多出的锚点进 HTML 字节与 hydration 遍历；首屏变大 |
| 内存受限 | 1k 项 × 3 个绑定 ≈ 3k 个常驻订阅 + 1k 个空 span |
| layout / paint 是瓶颈（复杂 CSS、大面积重排） | JS 侧再快也动不了 `P`，多出的锚点反而加重样式计算 |

### 14.6 天花板一句话与准入门槛

- 文本通道 ≈ 原生 DOM 直写；结构通道 ≤ 手工极致 memo 的 React；项目级 = 覆盖率 × JS 占帧比。
- **P4 准入门槛（计划判据，非实测）**：S1 / S2 的 JS 侧 commit 耗时相对原生 React 基线下降 **≥ 50%**；S3 / S4 **不得低于基线的 80%**（不许 regress）；S5 / S7 **必须零不一致帧**。若 S1 / S2 收益 < 20%，说明 T2 固定成本过高，应回到 R5 重新评估切块粒度，或考虑退回 T1。
- **【2026-11-05 补充，见 §15.7】** S9 异值组 DOM 写次数 ≤ 2、同值组 = 0，纯文本路径 render 次数恒为 0；S10 订阅集合正确且卸载后无残留 effect；S11 的 restart 次数与最坏延迟帧数须记录（暂不设硬性否决线）；S12 给出 `c_b / t_r`、`D_max`、`N_min` 实测建议值，替换 §15.4 表中占位初值。
- 所有阈值都是「要不要继续做」的判据，**不是承诺的性能数字。实测前不对外宣称任何提升倍数。**

---

## 15. 双重时序细化：统一事务调度、切块阈值与修订（2026-11-05）

> **状态**：源码核对 + 设计推导，**非实测**。本章是 §14 的细化与**部分修订**；凡与 §14 / §7 冲突，以本章为准。本轮仍未建包、未跑任何测试、未改实现代码。
>
> 本章回答三个问题：① 一次写入到底经过哪些阶段（精确时序）；② tearing 与批量错位能不能用**同一个机制**解掉；③ R5 说的「benchmark 定阈值」到底定什么。

### 15.1 精确时序：一次 `ref.value = x` 的完整链路

【已验证 2026-11-05】依据 Vue core `main` 分支 `packages/reactivity/src/dep.ts` 与 `effect.ts` 源码逐行核对：

| 阶段 | 所在调用栈 | 发生了什么 | 源码位置 |
| --- | --- | --- | --- |
| T0 | 用户代码 | `ref.value = x` → setter 经 `hasChanged` 抑制后调 `trigger(target, SET, key, ...)` | `ref.ts` / `baseHandlers.ts` |
| T1 | `dep.ts trigger()` | `startBatch()`（depth 1）→ 选中受影响的 dep → `dep.trigger()` → `dep.version++` 与 `globalVersion++` → `dep.notify()` | `Dep.trigger()` |
| T2 | `Dep.notify()` | 再 `startBatch()`（depth 2）→ 遍历 `subs` 链表 → `sub.notify()` → `ReactiveEffect.notify()` → `batch(sub)` 挂进 `batchedSub` 单向链表并打 `NOTIFIED` | `effect.ts batch()` |
| T3 | `Dep.notify()` 的 `endBatch()` | depth 2→1，`> 0` 直接 return，**不 flush** | `effect.ts endBatch()` |
| T4 | `trigger()` 的 `endBatch()` | depth 1→0 → **flush `batchedSub`**：逐个清 `NOTIFIED`，对 `ACTIVE` 的 sub 调 `ReactiveEffect.trigger()` | `effect.ts endBatch()` |
| T5 | `ReactiveEffect.trigger()` | 有 `scheduler` → **无条件 `scheduler()`**；无 `scheduler` → `runIfDirty()` → `isDirty()` 遍历 deps 版本 → `run()` | `effect.ts trigger()` |
| T6 | 我们的调度层 | 结构块 `store.bump()` → 微任务 → React lane → render（Transition 下二次 `getSnapshot`）→ commit → layout effect → paint | §7.5 / §7.7 |

三条由此得出的**修正**：

1. **批量边界 = 单次 `trigger()` 调用，不是「一个事件」**。`Dep.notify()` 与 `trigger()` 各包一层 `startBatch/endBatch`，嵌套 depth 在 `trigger()` 返回时归零并 flush。一个事件里连写 10 次 = 10 次独立 flush = 10 次文本 DOM 写。§14.1「包在写操作的同步调用栈内」偏松，应精确到此处。
2. **带 `scheduler` 的 effect 绕过了 `isDirty()`**：`trigger()` 的 `else if (this.scheduler)` 分支不检查脏标记，只要被 notify 就调 scheduler。§7.5 的 `Block` 用 `scheduler: () => store.bump()`，因此**每次 dep 版本变化都会 bump 并重渲染，即使 `render()` 输出结构未变**（数组 `length`、`ITERATE_KEY`、`ARRAY_ITERATE_KEY` 触发尤其明显）。§14.2 成本模型里的 `k` 应改称「被 notify 的块数（含假阳性）」，详见 §15.5。
3. **`effect(fn)` 创建时立即同步 `run()` 一次**（`effect.ts effect()`），首帧依赖收集与首次 DOM 写在 `useLayoutEffect` 内完成，符合 §7.4 / §7.9；但改成带 scheduler 后（§15.3）这次 `run()` 仍会发生，须保证 DOM 写入幂等。

另【已验证】`computed` 侧：`refreshComputed()` 有 `globalVersion` fast path，且只有 `hasChanged(value, _value)` 才 `dep.version++` —— **computed 链自带值级抑制**，但这条抑制覆盖不到「直接读 `reactive` 属性的 Block」。

### 15.2 React 侧修正：窗口不是「任意长」，但撕裂不可回滚

【已验证 2026-11-05，react.dev/reference/react/useSyncExternalStore】官方 Caveats 原文：

> "If the store is mutated during a non-blocking Transition update, React will fall back to performing that update as blocking. Specifically, for every Transition update, React will call `getSnapshot` a second time just before applying changes to the DOM. If it returns a different value than when it was called originally, React will restart the update from scratch, this time applying it as a blocking update, to ensure that every component on screen is reflecting the same version of the store."

以及 `getSnapshot` 的硬约束：*"While the store has not changed, repeated calls to `getSnapshot` must return the same value"*（按 `Object.is` 比较）、*"The store snapshot returned by `getSnapshot` must be immutable"*。§7.5 的 `createBlockStore().getSnapshot` 返回递增整数，符合这两条；`getServerSnapshot` 在 **hydration 期间也会被调用**且与服务端必须一致，与 §7.9 的结论相符。

由此修正 §14.4 税 1 与 §9 R12：

- **结构通道自带 React 的 anti-tearing 保护**：Transition 下 React 会在 commit 前二次 `getSnapshot`，不一致就重启为 blocking。所以「窗口可任意长」不成立 —— 有 React 调度约束的上界，且会自动降级。
- **但文本通道完全不在 store 管辖内**：T2 直写的 `nodeValue` 既不参与 `getSnapshot`，也不参与重启。文本在 T5 就已是**提交到 DOM 的事实**，无法回滚、无法重启。
- 所以撕裂的本质不是「结构块晚到」，而是「文本先到且不可撤销」。**靠让结构块追上修不了，只能让两者在同一时刻落地**（§15.3）。
- 顺带新增一项隐性成本：Transition 下的 **restart 会重复 render**，S7 / S11 必须把重启次数纳入指标。

### 15.3 统一事务调度器（把税 1 与税 3 一起解掉）

**设计变更**：文本通道从「裸 `effect`（无 scheduler）」改为「带 `scheduler` 的 `effect`」，与结构通道共用**一个事务（Txn）**。这推翻 §7.4 / §7.7 的实现细节，但**不违反 §0 决策第 6 条**：文本仍然零 `useSyncExternalStore`、零 React 重渲染，锚点方案与 `initial` 不变性照旧；变的只是 DOM 写入从「同步栈内」移到「同 task 的微任务内」。

**为什么可行**：§15.1 的 T4 表明，`endBatch()` 把**本次 trigger 命中的所有 effect** 在同一同步栈里逐个 `trigger()`。因此所有 scheduler 都会在同一个 microtask checkpoint 之前被调用完毕 —— 微任务 flush 时，事务里已经收齐「这次写入到底命中了哪些通道」的完整信息。**不需要编译期标注依赖集合、不需要静态分析、不需要运行时猜测**，且天然覆盖动态依赖切换。这比 §14.4 建议的「编译期标注 + 运行时分流」简单得多。

```ts
// core/txn.ts —— 概念实现，非最终代码
type TextCell = { read: () => unknown; write: (s: string) => void; last?: unknown }
type BlockCell = { store: { bump: () => void }; runner: () => void }

let pendingText = new Set<TextCell>()
let pendingBlock = new Set<BlockCell>()
let aligned: Array<() => void> = []
let pendingCommit = 0
let scheduled = false

export function scheduleText(cell: TextCell) {
  pendingText.add(cell)
  scheduleFlush()
}
export function scheduleBlock(cell: BlockCell) {
  pendingBlock.add(cell)
  scheduleFlush()
}
function scheduleFlush() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(flush)
}

function flush() {
  scheduled = false
  const texts = pendingText, blocks = pendingBlock
  pendingText = new Set(); pendingBlock = new Set()

  if (blocks.size === 0) {
    // 快路径：纯文本，零 React 参与
    for (const c of texts) {
      const v = c.read()
      if (Object.is(v, c.last)) continue   // 值级抑制
      c.last = v
      c.write(toText(v))
    }
    return
  }

  // 混合路径：文本挂起，与结构块 commit 对齐
  pendingCommit = blocks.size
  aligned = [...texts].map(c => () => {
    const v = c.read()
    if (Object.is(v, c.last)) return
    c.last = v
    c.write(toText(v))
  })
  for (const b of blocks) { b.runner(); b.store.bump() }
}

// 每个结构块在自己的 layout effect（commit 后、paint 前）中调用
export function onCommitDone() {
  if (--pendingCommit > 0) return
  const tasks = aligned; aligned = []
  for (const run of tasks) run()
}
```

要点与边界：

- **纯文本路径**：一次 `queueMicrotask` + 命中的 `Object.is` 比较 + 命中的 `nodeValue` 写。没有 `useSyncExternalStore`、没有 React render、没有 fiber 参与。T2 的核心收益完整保留。
- **微任务位于同一 task 的 paint 之前**，用户感知与同步写一致；换来的是**跨写去重免费**：§15.1 说 10 次写 = 10 次 `endBatch`，但 10 次 scheduler 只注册 1 个微任务 → 10 次写合并成 1 次（同值则 0 次）DOM 写。这正是 §14.4 税 3 想要的去重，且不需要额外队列。
- **混合路径**：文本写入挂到 `aligned`，每个结构块在**自己的 layout effect**（commit 后、paint 前）调 `onCommitDone()`，计数归零时统一落地。所有 DOM 变更在同一帧完成 → S5 / S7「零不一致帧」有了实现依据。
- **最坏情况**：若结构块被 React lane 延后到下一帧，文本也一起延后（正确性优先，多一帧延迟）。这是为消除 tearing 付的确定代价，须写进 README 并由 S5 / S7 / S11 量化。
- **依赖重收集**：带 scheduler 时 Vue 不会自动 `run()`，因此 flush 里必须显式调各 cell 的 `runner()`（`effect()` 返回的 runner 即 `e.run.bind(e)`，类型 `ReactiveEffectRunner<T>` 公开可调用）以重建 deps 集合；`read()` 只求值、不重收集。上面伪代码为突出事务决策省略了这一步，实现时不可省，并须防 `EffectFlags.RUNNING` 递归。另因 §7.5 的 `Block` 每次重渲染都会 stop + 重建 effect，`BlockCell.runner` **必须是取值器而非快照**，否则混合路径会跑在已停止的旧 effect 上。
- **epoch 隔离**：混合路径等待结构块 commit 期间若又有新写入，新写入必须归入**下一 epoch**，不得与当前 `aligned` 混用，否则会出现「旧文本值与新结构值」的错配。伪代码省略了 epoch 编号，实现须按事务批次隔离 `pendingText` / `pendingBlock` / `aligned` / `pendingCommit` 四组状态。
- **饿死兜底（正确性关键）**：若结构块在并发渲染中被丢弃、重启或卸载，`onCommitDone()` 可能永不被调用 → `pendingCommit` 不归零 → `aligned` 中的文本写入永久饿死，页面文本再也不更新。必须为等待中的结构块登记 cleanup（unmount 时强制递减计数），并设兜底：无存活结构块时直接 flush `aligned`。S11 必须显式覆盖「Transition 中结构块被丢弃」这一分支。
- **SSR**：`queueMicrotask` 在 Node 存在，但服务端 `useLayoutEffect` 不执行 → 无 cell 注册、事务为空；仍需显式 guard（§7.9 待确认项）。
- **`revision` 穿透**（§6.6 / §7.6）：`v-memo` deps 变化不走 Vue trigger，须由 deps 求值层直接调 `scheduleText(cell)` / `scheduleBlock(cell)` 注入同一事务，否则文本绑定刷新会绕开对齐机制、重新引入撕裂。这是 §13 遗留的「revision 从哪来」之外新增的一处实现约束。

三档策略对比（税 3 定稿）：

| | A 全同步（原 §7.4） | **B 微任务统一事务（本章）** | C rAF 对齐 |
| --- | --- | --- | --- |
| 10 次写同值的 DOM 写次数 | 10 | **0** | 0 |
| 10 次写异值 | 10 | **1** | 1 |
| 纯文本延迟 | 0 | 同 task 微任务 | 最长 1 帧 |
| 混合命中撕裂 | 有 | **无（同帧对齐）** | 无 |
| 仍零 React / 零 `useSyncExternalStore` | 是 | **是** | 是 |
| 主要风险 | 撕裂 + 写放大 | 混合路径最坏多一帧 | 可见延迟、INP 变差 |

**结论**：选 B。A 的正确性缺陷不可接受，C 的延迟没有额外收益（B 已同帧对齐）。§7.7 的「本节不锁定最终调度方案」到此关闭。

### 15.4 切块聚合阈值：把「benchmark 定阈值」写成可判定规则

§9 R5 / §14.6 只说了「benchmark 定阈值」，没说定什么。这里补成**编译期判定规则 + 3 个待实测常数**。

成本模型（沿用 §14.2 符号；`m` = 编译期切出的块数，`c_b` = 单块固定成本 = fiber + `ReactiveEffect` + thunk 闭包 +（文本）锚点 span，`t_b` = 单块每次命中的均摊成本）：

```
C_react = t_s + N·t_r + k·t_dom + P
C_rv    = C_setup_once + m·c_b + k·t_b + P       （纯文本路径，零 React 调度）

盈亏平衡（忽略一次性 setup，按单次更新）：
    m·c_b + k·t_b  <  (N − k)·t_r
⇒   m* ≈ (N − k)·t_r / c_b                       // 允许的块数上界
```

含义：**`N` 越小、`k/N` 越接近 1，切块越容易亏**。这解释了 §14.5 的「小组件」「全量更新」两类失败场景，并给出可计算判据，而不是含糊的「实测再定」。

编译期静态聚合规则（不需要 benchmark 即可实现）：

| # | 规则 | 理由 |
| --- | --- | --- |
| G1 | 静态子树（无动态表达式）不切 | 零收益，纯增 fiber |
| G2 | 同一 JSX 元素内相邻的文本 / 属性绑定**合并为一个块**，除非跨 `v-memo` / `<Block>` 边界 | 它们总是一起命中，拆开只增固定成本 |
| G3 | `v-memo` / `<Block>` 是**强制块边界** | 用户显式语义，不可合并 |
| G4 | 单块内动态点数 ≤ `D_max` | 防止一个块太大、退化成整组件重渲染 |
| G5 | 嵌套深度 > `L_max` 时停止递归切分，整体归入父块 | 防止深层 JSX 产生过多 fiber |
| G6 | 组件 fiber 数估计 `N < N_min` 时**整组件不切块**，直接走 R4 降级路径 | §14.5 小组件场景 |
| G7 | 事件处理器、effect、watch 内的响应式读取**不切块** | 不属于渲染路径，切了也不会被订阅 |
| G8 | 列表项内动态点按项切，但列表整体仍是结构块（§6.5 / R6） | 首版边界 |

需要 benchmark 填的 **3 个常数**（不是一个阈值）：

| 常数 | 定义 | 由哪些场景定 | 建议初值 |
| --- | --- | --- | --- |
| `D_max` | 单块动态点上限 | S2（大组件）/ S4（长列表） | 8 |
| `N_min` | 切块收益的组件规模下限 | S2 与小组件对照组 | 10 |
| `c_b / t_r` | 单块固定成本 ÷ 单 fiber reconcile | S1 / S3 拟合、`m*` 的斜率 | **待实测，禁止拍定** |

`L_max` 默认 3，可由 `D_max` 推导，不单列实测。另提供编译选项 `granularity: 'fine' | 'balanced' | 'coarse'`（默认 `balanced` = 上表规则）；`<Block>` / `v-memo` 始终作为手动合并 / 拆分旋钮。

**判定**：S3（`k≈N`）若 `C_rv / C_react > 1.25`，说明扇出成本过高，须提高聚合度（降低 `m`）或对该场景直接走降级路径。这是 §14.6「S3 / S4 不得低于基线 80%」的量化依据。

### 15.5 结构块假阳性：能做什么、不能做什么

§15.1 修正 2 指出 `scheduler` 绕过 `isDirty()`。先排除两条看似可行、实际不可行的方案：

- **「把 `render()` 包进 `computed` 拿 `hasChanged` 抑制」不可行**：`render()` 每次返回新建的 ReactElement，`Object.is` 恒为 false，computed 的抑制完全失效，还多一层订阅。
- **「在 scheduler 里检查 `runner.effect.dirty`」基本无效**：`ReactiveEffect.dirty` getter 确实公开且调 `isDirty()`，但触发时 `dep.version` 已 `++` 而 `link.version` 未更新 → 恒返回 true；同批重复 notify 又已被 `NOTIFIED` 标记去重。它抑制不了「迭代键变了但渲染结果没变」这类真正的假阳性。

**结论：首版不消除，只限定代价并量化。** 假阳性触发的 `bump()` 会让 React render + reconcile，但输出结构相同时 React 不会写 DOM，故代价上界是 `k·t_r`（不是 `k·(t_r + t_dom)`）。把它写进 §14.2 的 `k` 定义（改为「被 notify 的块数」），由 S3 / S12 专门量化；若 S3 超标，通过 `granularity: 'coarse'` 合并相邻块来降低 `m` 与扇出，而不是在运行时加昂贵的输出比较。

### 15.6 对前文的修订清单

| 章节 | 原表述 | 修订 | 依据 |
| --- | --- | --- | --- |
| §14.1 | 批量「包在写操作的同步调用栈内」 | 精确到「单次 `trigger()` 调用 + 嵌套 `startBatch/endBatch`」 | §15.1 T1–T4 |
| §14.1 | 「两条时钟不同步是全部矛盾来源」 | 仍成立，但运行时将两路收束进单一事务 | §15.3 |
| §14.2 | `k` = 命中块数 | `k` = 被 notify 的块数（含假阳性） | §15.1 修正 2 / §15.5 |
| §14.4 税 1 | 「`startTransition` 下窗口可任意长」「编译期标注依赖集合分流」 | 均作废；React 二次 `getSnapshot` 会重启为 blocking，文本不可回滚；改为统一事务 | §15.2 / §15.3 |
| §14.4 税 3 | 「取舍必须用 S1 实测，不能拍脑袋定」 | 定稿为 B 方案；S1 / S9 改为验证去重次数与延迟 | §15.3 |
| §9 R12 | 同上两处 | 影响与缓解列改写 | §15.2 / §15.3 |
| §7.4 | 文本用**裸 `effect`** 同步写 DOM | 改为带 `scheduler` 的 effect + 微事务 flush；锚点 / `initial` / 零 uSES 不变 | §15.3 |
| §7.5 | `Block` 的 `scheduler` 无条件 bump | 补注假阳性及代价上界 | §15.1 / §15.5 |
| §7.7 | 「本节不锁定最终调度方案」 | 已锁定为 §15.3 的统一事务 | §15.3 |
| §6.6 / §7.6 | `revision` 触发文本重建 effect | 新增约束：revision 刷新必须注入同一事务，否则重新引入撕裂 | §15.3 |
| §10.3 | S1–S8 | 新增 S9–S12；帧内一致性给出可测量定义 | §15.7 |
| §14.6 | 准入门槛 | 补 S9 / S10 / S11 判据，仍为计划判据 | §15.7 |

### 15.7 测试与判据细化（§10.3 增补）

| ID | 场景 | 主要观测 |
| --- | --- | --- |
| S9 | 同一事件内连续 10 次写，分「同值」「异值」两组 | DOM 写次数、`MutationObserver` 记录数（验证 §15.3 去重与值抑制） |
| S10 | 动态依赖切换（条件分支先后读不同 ref） | `runner()` 重收集后订阅集合是否正确、旧 dep 是否残留 |
| S11 | `startTransition` 下重复 S5 | React **restart 次数**、blocking 降级次数、帧内一致性、最坏延迟帧数 |
| S12 | `k≈N` 下切换 `granularity` 三档 | `C_rv / C_react` 曲线，拟合 `c_b / t_r` 与 `D_max` |

**「帧内一致性」的可测量定义**：用 `MutationObserver` 收集一次写入后到下一帧 `requestAnimationFrame` 之间的全部记录；若 `characterData`（文本）与 `attributes`（属性）记录**未落在同一个 rAF 区间**，判定为一个不一致帧。S5 / S7 / S11 均按此口径计数。

**判据补充**（全部为计划判据，非实测）：

- S9 异值组 DOM 写次数 ≤ 2，同值组 = 0；纯文本路径 render 次数恒为 0。
- S5 / S7 / S11 零不一致帧；S11 的 restart 次数与最坏延迟帧数须记录并写回文档，暂不设硬性否决线。
- S10 订阅集合与期望一致、卸载后无残留 effect。
- S12 给出 `c_b / t_r` 与 `D_max` 的实测建议值，替换 §15.4 表中初值；**在此之前 §15.4 的 8 / 10 / 3 只是占位初值**。

### 15.8 事实 / 推导 / 待实测分级与实施前取舍

| 级别 | 内容 |
| --- | --- |
| **已验证**（源码或官方文档） | §15.1 全部 T0–T5、`scheduler` 绕过 `isDirty`、`computed` 的 `hasChanged` 抑制；§15.2 的 `useSyncExternalStore` Caveats 与 `getSnapshot` 约束；`getServerSnapshot` 在 hydration 期调用 |
| **设计推导**（本章提出，未实现） | §15.3 统一事务调度器与「微任务 flush 时信息已收齐」的论证；§15.4 成本公式 `m*` 与 G1–G8 规则；§15.5 假阳性代价上界 `k·t_r` |
| **待实测**（不得以推理代替） | 微任务是否总在 paint 前（长任务 / 跨浏览器）；layout effect 中 `bump()` 是否被 React 同步 flush；§14.4 税 2 的 S8 commit 往返；hydration 首屏值；StrictMode 下事务幂等；`c_b/t_r`、`D_max`、`N_min` 三个常数 |

**实施前仍需拍板的 2 点**（有实测数据即可按判据自动决策，不阻塞 P0 建包）：

- **P-A**：混合路径是否接受「最坏多一帧延迟」以换取零不一致帧？若不接受，只剩「退回 T1（文本也用 `useSyncExternalStore`）」或「放弃跨通道一致性约束」两条路，都会动到 §0 决策第 6 条。
- **P-B**：§15.5 的假阳性是否首版就做编译期合并优化（`granularity: 'coarse'` 提前生效），还是首版仅记录成本、由 S12 结果再定？

**§15 结束。本轮工作边界**：仅新增本章 + 按 §15.6 修订既有章节文字；未创建 `packages/reactivue/`、未安装 `@vue/reactivity`、未写实现代码、未运行测试或 benchmark。

---
## 16. 初始架构包落地记录（2026-11-05）

> **状态**：已建包、已实现 P0–P2 运行时、P3 为编译期骨架。**实测记录（全绿）**：`rs test` 21/21、`cargo test` 4/4、`tsc --noEmit` 通过、`rs lint` 通过（29 files / 86 rules）、`pnpm build`（`build:native` + `rs lib`）通过（22 files / 27.4 kB）、dist 五个入口经 Node 真实 `import()` 成功、napi `transform` 实际可调用（骨架按预期原样返回）。**仍未执行 §10.3 的 S1–S12 benchmark，不宣称任何性能提升倍数。**

### 16.1 三条决议

| # | 决议 | 落地 |
| --- | --- | --- |
| P-A | **接受**混合路径「最坏多一帧延迟」换零不一致帧 | §15.3 统一事务：纯文本微任务快路径 / 混合命中挂起到结构块 commit 的 layout effect 同帧落地；`Block` 的 layout effect 调 `onCommitDone`，卸载调 `cancelBlock`，另有 250ms 极端兜底防饿死 |
| P-B | **首版就做**假阳性抑制 | `granularity: 'coarse'` 下按 `groupKey` 合并同组结构块为一次 bump；`Block` 可选 `fingerprint` 做值级抑制；默认 `balanced`。见 `core/txn.ts` 与 `react/Block.tsx` |
| — | **建初始架构包** | `packages/reactivue/` 已创建并接入 workspace / catalog / changeset |

### 16.2 实际产出

```
packages/reactivue/
  package.json  rstack.config.ts  tsconfig.json  tsconfig.test.json
  types/global.d.ts  README.md  .gitignore  .changeset/reactivue-initial.md
  src/core/     scope.ts  setup.ts  txn.ts
  src/react/    context.ts  lifecycle.ts  TextBinding.tsx  Block.tsx
                MemoBlock.tsx  Host.tsx
  src/compat/   index.ts  instance.ts  watch.ts
  src/internal/ index.ts
  src/plugins/  shared.ts  transform.ts  vite.ts  rsbuild.ts
  src/shared/   env.ts  to-text.ts  native.ts
  native-rust/  Cargo.toml  build.rs  src/lib.rs  src/reactivue/mod.rs
  scripts/build-native.mjs
  tests/        core.test.ts  txn.test.ts  runtime.test.tsx  plugins.test.ts
```

- `pnpm-workspace.yaml` catalog 新增 `@vue/reactivity: 3.5.44`、`jsdom: 30.1.3`；`pnpm install` 已完成。
- exports 六条（`.` / `./vite` / `./rsbuild` / `./compat` / `./internal` / `./package.json`）与 `publishConfig` 均已落；`rs lib` 产物路径逐项核对存在（含 `dist/types/**`）。
- 包级 `rstack.config.ts` 覆盖 `testEnvironment: "jsdom"`，DOM 单测生效；入口 glob 同时覆盖 `./src/**/*.ts` 与 `./src/**/*.tsx`（§4.2 待确认项已验证）。

### 16.3 实现中发现并修正的设计问题

1. **§5.3 的 `Setup<P> = (props) => JSX.Element` 与 R4 降级路径互斥**。JSX 在 setup 执行时已把 `{count.value}` 求值成字符串常量，之后没有可重新求值的载体，无插件时无法响应式更新。实现把返回类型放宽为 `ReactNode | (() => ReactNode) | { render: () => ReactNode }`，**推荐 setup 返回 render thunk**（与 viewfly 的「组件返回渲染函数」一致），编译产物仍是 `{ render }` 形态；返回静态 JSX 且未启用插件时 DEV 告警并降级为静态渲染。`defineComponent` 的降级路径因此是「整体一个 `Block` 订阅 render thunk 的依赖」——setup 仍只跑一次、功能正确、粒度为组件级。
2. **`types/global.d.ts` 必须是模块**。缺 `import` 时 `declare module "react"` 会变成环境模块声明并**覆盖整个 react 类型**，导致所有 `ReactNode` / hooks 导出消失。已加 `import "react";`（§5.6 的模块增强写法需补这条）。
3. **Rstest 使用 classic JSX transform**（`React is not defined`）。本包 tsconfig 改用 `"jsx": "react"` 并在所有 `.tsx` 显式 `import * as React`，TS 与 rstest 才能一致；React 19 会打印 outdated JSX transform 警告，后续可换 `@rsbuild/plugin-react` 恢复 automatic runtime。
4. **`@vue/reactivity` 3.5.44 未导出 `watchEffect`**，且裸 `watch` 的 `WatchOptions` **没有 `flush` 字段**（`flush` 属 runtime-core）。`./compat` 的 `watchEffect` 改为 `effect + stop` 兜底，`watch` 直接 re-export。
5. **StrictMode 的 mount→unmount→mount 会误 stop scope**。用「延迟 dispose」：cleanup 里置 `mounted=false` 并注册微任务复查，第二次 setup 会置回 `true`，微任务里仍为 false 才真正 `scope.stop()`。
6. **TextBinding 的 effect 不直接写 DOM**：`effect(fn)` 的 fn 只收集依赖，DOM 写入统一交给 `core/txn.ts` 的 flush；挂载 / revision 重建时额外同步一次当前值，保证首屏一致。`initial` 由 `useState` 初始化且永不变化。
7. **`scripts/build-native.mjs` 的 `rustup target add` 会长时间挂起**（本机 14 分钟无 CPU、无产物写入）。原因是联网检查 + 无谓的 `--target` 交叉参数。已改为：本机默认目标**跳过 rustup 且不加 `--target`**，仅显式 `TARGET_TRIPLE` 交叉编译时安装目标，并给子进程加 timeout。修复后 release 编译 **7.25s** 完成。

> **2026-11-05 第二轮更新**：本节与 §16.5 描述的骨架状态**已被 §17 取代**，保留作为历史记录。

### 16.4 P3 骨架边界（明确未做，现已由 §17 完成）

`native-rust/src/reactivue/mod.rs` 目前只做**扩展名过滤 + tree-sitter TSX 解析**，解析失败 / 非目标扩展名原样返回，**不改写源码、不注入 thunk、不消费 `v-memo`**。因此：

- 插件注册后不会改变代码，`defineComponent` 始终走 §16.3 第 1 条的降级路径；
- `v-memo` 的 R-A 外壳（`jsx-directive` 白名单 / 类型 / 值校验 / `errors` 级别与残留报错）**未实现**，两插件共存时残留 `v-memo` 仍会流到 DOM；
- `granularity` 目前只影响运行时 `configureTxn`，编译期尚未生成 `groupKey` / `fingerprint`。

### 16.5 未完成项（下一轮，P3 / R-A 两项已由 §17 完成）

P3 切块转换与转换快照单测、`jsx-directive` 侧 R-A 外壳（白名单 / `errors` 级别 / 残留报错）、`examples/reactivue-all`、VueUse 实测、S1–S12 benchmark 与 `c_b/t_r` / `D_max` / `N_min` 常数拟合、根 README Packages 条目与 website 使用文档页、source map、HMR 状态保留、Rstest 换回 automatic JSX runtime（消除 outdated transform 警告）。

---

## 17. P3 切块与 R-A 外壳落地记录（2026-11-05，第二轮）

> **状态**：P3 编译期切块已实现并经快照单测；`jsx-directive` 的 R-A 外壳已实现；两插件串联链路经 `dist` 产物实测通过。**仍未执行 §10.3 的 S1–S12 benchmark，不宣称任何性能提升倍数。**

### 17.1 实测矩阵（全绿）

| 项 | `@uno-pc/reactivue` | `@uno-pc/jsx-directive` |
| --- | --- | --- |
| `cargo test` | **16/16**（原 4 个骨架测试 → 16 个切块快照） | **24/24**（原 19 + 5 个 R-A 回归） |
| `rs test` | **32/32**（core 5 / txn 8 / runtime 6 / plugins 5 / transform 8） | **22/22**（directive 12 / plugins 10，新增 3 个 R-A 插件用例） |
| `tsc --noEmit` | 通过 | 通过 |
| `rs lint` | 通过（30 files / 86 rules） | 通过（14 files / 86 rules） |
| `pnpm build` | 通过：`native/win32-x64-msvc.node` + 22 files / 27.8 kB | 通过：8 files / 5.6 kB |
| 跨插件链路 | 见 §17.3 | — |

`jsx-directive` 的 `lint` 此前因缺少包级 `define.lint` 而失败（既有基线问题，非本轮引入）。本轮补上与根一致的规则集后全绿，未修改任何既有源码以迎合规则。`reactivue` 的 `test` 脚本改为 `pnpm build:native && pnpm test:rust && rs test`，避免源码改动后 TS 测试仍加载旧 `.node`。

### 17.2 编译期实际产物

真实产物（`node` 调用 `dist/plugins/vite.js` 取得，非概念示意）：

```tsx
// 源码
const A = defineComponent(() => <p v-memo={[x]}>{n.value}</p>);

// 产物
import { TextBinding as _TextBinding, MemoBlock as _MemoBlock, createCompiledHost as _createCompiledHost } from '@uno-pc/reactivue/internal';
const A = _createCompiledHost(() => ({ render: () => (
  <_MemoBlock deps={() => ([x])} render={() => (
    <p><_TextBinding value={() => (n.value)} /></p>
  )} />
) }));
```

| 源码形态 | 产物 | 通道 |
| --- | --- | --- |
| `{primitiveExpr}` 文本插值 | `<_TextBinding value={() => (expr)} />` | 文本（零 `useSyncExternalStore`） |
| 含 JSX / 箭头函数 / 对象 / 数组的表达式 | `<_Block render={() => (expr)} />` | 结构 |
| 带动态属性的元素（`className={...}` 等） | 整个元素提升为 `<_Block render={() => (<tag .../>)} />` | 结构 |
| `<tag v-memo={[a,b]}>` | `<_MemoBlock deps={() => ([a,b])} render={() => (<tag .../>)} />` | 结构 |
| `<Block>...</Block>` | `<_Block render={() => (<>切块后 children</>)} />` | 结构 |
| `return <JSX/>` / `() => <JSX/>` | 包装为 `{ render: () => (...) }`，`defineComponent` → `_createCompiledHost` | — |

实现要点：

- **编辑策略**：不用全局区间列表，而是「每个 JSX 节点自底向上合成自己的替换文本」（`transform_jsx` → `apply_edits(node_text, node.start_byte, edits)`）。嵌套编辑天然被内聚，规避了 §6.9 担心的区间重叠问题。
- **合法性校验**：每个 Rust 快照测试都把产物重新交给 tree-sitter 解析并断言 `!has_error()`，保证生成代码是合法 TSX。
- **标识符避让**：`_TextBinding` / `_Block` / `_MemoBlock` / `_createCompiledHost` 经 `unique_identifier` 避让源码已有名字；import 按实际用到的符号生成，插在首个 `import` 之前（`'use client'` 之后）。
- **文本判定**按 §6.2 保守白名单：表达式子树中出现 JSX / 函数 / 对象 / 数组 / `new` / `await` / 赋值 / 序列即降级结构通道。
- **只在 `defineComponent` 内切文本块**：普通 React 组件里非响应式局部变量没有 trigger，切成 TextBinding 后会永不更新（这是 §13.2 前置缺口的运行时根因）。
- **`granularity: "coarse"`** 生成 `groupKey="<filename>#<index>"`，同一 `defineComponent` 的结构块合并为一次 bump（P-B 主项）。

### 17.3 R-A 外壳与跨包契约实测

`jsx-directive` 侧按 §13.5 落地：`has_directive_candidate` 白名单加 `memo`（否则只含 `v-memo` 的文件会被早退、错误报不出来）；`TransformOptions` 加 `memo?: 'error' | 'preserve'`（默认 `error`）；`TransformResult` 加 `errors: Vec<Warning>`；新增 `collect_memo_errors` 扫描残留属性；TS 侧 `throwOnErrors` 在 Vite / Rsbuild 插件中 `throw`，`transformDirectives` 在 `errors` 为空时不暴露该字段以保持既有返回结构。`v-memo` 的 TSX 类型由两包各写一条**同型**模块增强（`"v-memo"?: unknown[]`）。

用两包 `dist` 产物做的真实串联验证：

| 场景 | 结果 |
| --- | --- |
| `ReactivueVite()` 先跑 → `JsxDirectiveVite()` | reactivue 产物无 `v-memo` 残留；jsx-directive 正常放行，未抛错 |
| 未安装 reactivue（原始源码直接喂 jsx-directive） | 抛出 `A.tsx:1:36: [jsx-directive] v-memo requires @uno-pc/reactivue. Install it and register ReactivueVite() before JsxDirectiveVite().` |
| `JsxDirectiveVite({ memo: 'preserve' })` | 不抛错，属性原样保留给下游工具链 |

**没有 import 边、没有配置传递、没有跨包 API 调用**，唯一通信是「源码里是否还残留 `v-memo`」。

### 17.4 §7.3 的重新修订（重要，需评审）

原 §7.3 把 props 同步放到 layout effect 的理由是「裸 `effect` 同步 trigger 会在 React render 阶段直改 DOM」。**§15.3 之后这个理由已不成立**：所有 `TextBinding` / `Block` 的 effect 都带 `scheduler`，`trigger()` 只把 cell 加入微任务事务，DOM 写入统一在 `flush()`，render 阶段写 reactive props 不再同步触碰 DOM。

而实现中暴露出一个新的实际问题：`v-memo` 的 deps 在**宿主 render 层**求值（§6.6），若 props 只在 commit 后的 layout effect 同步，deps 永远晚一个 commit 才读到新值 —— 端到端测试 `v-memo={[props.version]}` 因此不触发 `revision`。

**实现**：`createCompiledHost` 在 render 阶段额外调一次 `syncProps`（幂等、`pauseTracking` 包裹写入），`useHostInstance` 里 layout effect 的那次保留作 SSR / 并发兜底；`defineComponent` 降级路径不变。

**未消除的风险**：并发 render 被丢弃时，reactive props 已更新而 UI 未 commit；下一次 committed render 会因幂等同步收敛，但存在与 §14.4 同类的短暂窗口（比 P-A 已接受的「最坏多一帧」更短）。若 S11 测出不一致帧，应回退到 §6.6 的完整方案：**宿主用原始 `reactProps` 求值 deps 并通过 context 下发**，而不是让 deps 读 reactive props。此项列入 §17.6。

### 17.5 与设计文档的偏差（实现取舍）

| # | 设计原文 | 实现 | 理由 |
| --- | --- | --- | --- |
| 1 | §6.10 非数组 `v-memo`「保留源码 + 警告」 | 消费属性 + 降级 `_Block` + 警告 | R-A 下残留即报错，且文案「请安装 reactivue」对已安装用户是误导 |
| 2 | §13.2 `defineComponent` 外 `v-memo` 的 revision 来源为前置缺口 | 消费为 `_MemoBlock`（块内不切文本）+ 警告 | 满足 R-A「输入中不得残留」；同时避免 §17.2 的非响应式 stale 问题 |
| 3 | §6.2 `<Block>` 包裹区切为一个 `_Block` | 编译期标记，标签本身被替换 | 语义等价且少一个运行时组件 |
| 4 | §6.10 setup 内 hooks「保留源码不转换」 | 跳过切块 + 告警（strict 下 error），但其中的 `v-memo` 仍由残留消费步骤处理 | 同上，避免误导性报错 |
| 5 | P-B / §15.5 假阳性抑制 | 运行时 `fingerprint` 接口就绪，**编译期未生成** | 元素块输出是每次新建的 ReactElement，值级 `hasChanged` 恒失效，生成无收益；`groupKey` 合并已落地 |
| 6 | §6.4 属性绑定 | 排除 `key` / `ref` / `on[A-Z]*` | 避免破坏 key 语义与事件闭包（§15.4 G 规则） |
| 7 | §6.5 列表项递归切分 | 已实现，但可能产出嵌套冗余 `_Block` | 首版正确性优先；聚合阈值待 S12 拟合 |

另：`strict` 选项现同时把两类告警（非数组 `v-memo`、setup 内 hooks）升级为 `errors`，由插件 `throw`；默认仅告警。

### 17.6 仍未完成

`examples/reactivue-all`、VueUse 实测、S1–S12 benchmark 与 `c_b/t_r` / `D_max` / `N_min` 三个常数拟合、根 README Packages 条目与 website 使用文档页、source map、HMR 状态保留、Rstest 换回 automatic JSX runtime（消除 outdated transform 警告）、SSR/hydration 实测、§17.4 风险的 S11 量化与 §6.6 完整 deps 方案、编译期 `fingerprint`、嵌套冗余块的聚合优化。

## 18. Rust 拆分、插件顺序修正与 VueUse 实测落地记录（2026-11-05，第三轮）

> **状态**：四个 napi crate 已完成纯结构性拆分（行为零变更）；hooks 检测误报与 Rsbuild 插件执行顺序两处正确性问题已修复；`examples/reactivue-all` 构建通过；VueUse 兼容经 DOM 回归测试实测通过。仍未执行 S1–S12 benchmark。

### 18.1 实测矩阵（全绿）

| 项 | `@uno-pc/reactivue` | `@uno-pc/jsx-directive` | `@uno-pc/signals-transform` | `@uno-pc/style-layer` |
| --- | --- | --- | --- | --- |
| `cargo test` | **17/17**（+1 VueUse 正向用例） | **24/24** | **8/8** | **9/9** |
| `rs test` | **34/34**（+2 VueUse DOM 用例） | **22/22**（2 个断言随契约更新） | — | — |
| `tsc --noEmit` | 通过 | 通过 | — | — |
| `rs lint` | 通过（31 files） | 通过（14 files） | — | — |
| `pnpm build` | 通过（22 files / 28.0 kB） | 通过（8 files / 5.6 kB） | — | — |
| example 构建 | `examples/reactivue-all` 通过，dist 确认含 TextBinding / MemoBlock 产物 | — | — | — |

### 18.2 Rust 源码拆分（纯结构，行为零变更）

| crate | 拆分方式 | 拆分前最大文件 | 拆分后最大业务文件 |
| --- | --- | --- | --- |
| `jsx-directive` | 一指令一文件（`directives/v_if.rs`、`v_for.rs`、`v_model.rs`、`v_html_text.rs`、`v_bind.rs`、`v_show.rs`、`v_memo.rs`）+ `parser` / `utils` / `shorthand` / `ast` / `render` / `entry` / `types` | 1739 行 | 453 行（tests.rs） |
| `reactivue` | `types` / `utils` / `ast` / `jsx` / `setup` / `entry` / `tests` | 945 行 | 224 行（jsx.rs） |
| `signals-transform` | `types` / `detect` / `inject` / `entry` / `tests` | 581 行 | 215 行（detect.rs） |
| `style-layer` | `rules` / `imports` / `entry` / `tests` | 503 行 | 212 行（rules.rs） |

`mod.rs` 只保留模块声明与 `pub use`；函数体字节级照搬，仅补 `pub(crate)` 可见性。四 crate `cargo test` 全绿、`cargo check` 零警告。

### 18.3 hooks 检测修复（VueUse 误报）

原实现把 setup 内任意 `use[A-Z]` 调用视为 React hooks 并跳过切块，VueUse 的 `useNow` / `useToggle` 会误触发降级。修复：`collect_react_hooks` 遍历 `import_statement`，只收集从 `react` / `react-dom` 导入的 `use*` 本地名（含 alias），`contains_hooks` 改为查该集合。fixture 补 `import { useContext } from 'react'`，新增 VueUse 组合式函数不触发降级的正向用例。

### 18.4 Rsbuild 插件执行顺序语义（probe 实验结论）

R-A 要求 reactivue 插件先于 jsx-directive 消费 `v-memo`。真实构建中曾出现 jsx-directive 先跑而报「残留 v-memo」。probe 实验证实：**Rsbuild 的多个 `order: "pre"` transform 按注册逆序执行**（后注册先跑），而 `pre` 档恒先于 `default` 档、与注册顺序无关。因此顺序保证不能依赖注册顺序：reactivue 保持 `pre`，jsx-directive 改为 default（无 `order`）。残留报错文案同步改为「Install it and register its Vite/Rsbuild plugin (transform order is handled by the plugins).」，jsx-directive 两个插件测试断言随契约更新。

### 18.5 VueUse 兼容实测（决议 G4 验证）

`tests/vueuse.test.tsx`（jsdom）：useToggle 初始渲染 OFF、点击后异步事务刷新为 ON；useNow 初始渲染日期为真。全链路：`@vueuse/core` → 内部 `import from "vue"` → alias 到 `./compat` → 响应式即 `@vue/reactivity` 本体 → `Block` effect 的 trigger 链路，无需任何胶水。过程中补齐的 compat 缺口：

- `hasInjectionContext`（VueUse 依赖检查用；本层语义为「存在实例上下文即 true」）。
- `TransitionGroup` stub（仅 ESM linking 需要，React 下不会走到）。

实测确认的三条使用语义（已写入 README）：① JSX 中 ref 不自动解包，必须显式 `.value`（Vue JSX 同语义）；② React JSX 中布尔/`null` 插值渲染为空，Vue 期望的 `"true"` 需 `String()` 转换；③ trigger 走微任务事务（§15），测试需 `await act(async () => ...)` 冲刷，产品行为（最坏一帧延迟，P-A）不变。

VueUse 15 兼容注记：`useNow` 已移除 `interval` 选项（改 `ConfigurableScheduler.scheduler` 自定义），示例与测试均用默认调度。

### 18.6 示例按 API 分块与浏览器实测（2026-11-05，第三轮后续）

`examples/reactivue-all` 重写为按 API 分节的对比示例（编译产物对照 / TextBinding vs setState / computed / Block / v-memo / VueUse / props 桥），react-scan 直观对照「React 重渲染高亮 vs 文本直写无高亮」。经 ego-browser 真实浏览器逐节交互实测，全部符合预期：TextBinding 宿主渲染计数恒为 1；`other +1` 不触发 computed 求值；useToggle/useNow/props 桥/setup 只跑一次均通过，页面零错误。

### 18.7 实测发现的缺口与修复：v-memo 纯 ref deps 不触发刷新

浏览器实测发现：deps 求值带 `pauseTracking` 且只发生在 `MemoBlock` render 时，**deps 中的纯 ref（如 `[epoch.value]`）没有任何 React 侧订阅者**，变化永远不触发整块刷新——「deps 变化必然刷新」的承诺只在 deps 挂 reactive props（React 驱动宿主重渲染）这条路上成立。修复：`MemoBlock` 新增响应式 effect 显式订阅 deps 的响应式依赖，trigger 后在微任务事务中重新求值并比较，变化才 `revision++`；React 渲染路径上的比较保留为兜底，两条路径经 `lastRef` 同步后幂等。与 §15.3「trigger 只入微任务事务」一致，不引入 render 阶段 DOM 写入。新增回归单测（禁用通道时该测试失败，验证有效）；修复后 reactivue `rs test` **35/35**，浏览器复验 `depsForcedRefreshWorks: true`。

### 18.8 实测发现的缺口与修复：Block 首次 commit 后 alive 自锁（同轮后续）

对比示例的连续交互实测暴露第二处缺口，三个症状同根因：① 结构块只有第一次依赖更新生效，后续全部失效；② `v-memo` deps 与 ③ props 桥均「第一次有反应、后续无反应」。根因：`cell.alive = true` 只在 Block 的 **render phase** 设置，而 layout cleanup（每次 commit 都会跑）把它置回 `false` 后没有任何代码恢复——下一次 render 又必须由 bump 驱动，bump 却被 flush 的 `alive` 过滤丢弃，形成自锁。首次挂载时 alive 为 true，故只有第一次交互正常。

修复：layout effect setup（effect 重建处）显式恢复 `cell.alive = true`；cleanup 与 setup 同步相邻，窗口内不会插入 flush 微任务。新增「结构块连续多次依赖更新都生效」回归单测（修复前稳定复现第二次失效）；修复后 reactivue `rs test` **36/36**，浏览器复验：结构块 3 次追加 + 1 次移除全部生效（3→5）、v-memo 连续 deps 刷新正常、各 section 宿主渲染计数保持 1（生产构建下首次交互不存在跨 section 重渲染；dev 下 react-scan 首帧高亮为初始化显示）。

### 18.10 覆盖率基线、生命周期/SSR 测试与 source map 落地（2026-11-05，第四轮）

**覆盖率基线**（`rs test --coverage`，@rstest/coverage-istanbul）：总体语句 87.05% / 分支 72.93% / 行 89.02%；react 层 97.5%/90%。本轮新增 3 个测试文件：`nesting`（React↔reactivue 双向与四层嵌套）、`edge-cases`（六生命周期钩子语义、钩子容错、TextBinding 边界值、StrictMode 双挂载、错误边界、卸载竞态）、`ssr`（renderToString 输出形态）。

**实测再次发现两处缺陷并修复**：

1. `MemoBlock` deps 通知通道在 React **render 阶段**触发 `setRevision`（syncProps 写 reactive props → 同步 trigger），命中 React 的 "setState during render of a different component" 警告。修复：比较与 `setRevision` 推迟到微任务，脱离渲染栈。
2. 生命周期接线缺口：**mount 首次 commit 误触发 `onUpdated`**（且 layout effect 先于 passive effect，顺序错在 mounted 之前）；**`onBeforeUpdate` 从未接线**。修复：Block 增加 `hasCommittedRef`，首次 commit 不触发 updated；beforeUpdate 在 effect scheduler（trigger 时）触发，与 updated 成对。

**source map（reactivue 插件）**：native `TransformResult` 新增 `edits`（顶层编辑区间），TS 侧 `buildSourceMap` 用 magic-string 生成（区间粒度，含 sourcesContent），Vite/Rsbuild 插件透传；example 开启 `output.sourceMap` 后产物 `.map` 的 sources/sourcesContent 验证通过。**过程中发现并修复偏移语义缺陷：native 输出为 UTF-8 字节偏移，MagicString 使用 UTF-16 code unit 索引，含多字节字符（中文注释）的源码全部错位**——Rust 侧新增 `Utf16Index`，warnings/errors/edits 输出前统一转 UTF-16，并有含中文的专项 Rust 测试。

`jsx-directive` 的 source map 已于同轮补齐：`render_node` 增加 `top_edits` 收集参数（仅 root 层聚合的「变化子树整区间 → 变换文本」进入收集，粒度与产物结构对应），entry 层复用 `Utf16Index` 转 UTF-16 输出；`warnings.ts` 的行列换算同步改为 UTF-16 语义（原按字节切 Buffer）。

### 18.11 仍未完成

S1–S12 benchmark 与 `c_b/t_r` / `D_max` / `N_min` 三个常数拟合、根 README Packages 条目、HMR 状态保留、Rstest 换回 automatic JSX runtime（消除 outdated transform 警告）、hydration 实测（SSR 输出形态已有测试）、§17.4 风险的 S11 量化与 §6.6 完整 deps 方案、编译期 `fingerprint`、嵌套冗余块的聚合优化、compat 层 pinia 可行性评估、SSR 真 server 环境（isServer=true 路径）测试。
