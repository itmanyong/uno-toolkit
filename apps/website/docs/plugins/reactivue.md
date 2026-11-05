---
description: "@uno-pc/reactivue 的安装、插件注册与顺序约定、defineComponent 用法、语义差异、VueUse 兼容与可运行示例。"
---

# @uno-pc/reactivue

在 React 19 上使用 Vue 3 composition API：响应式层直接用 `@vue/reactivity`（`.value` 语义原样保留），编译期把 JSX 切成常驻订阅块，文本绑定绕过 React 直接写 `Text.nodeValue`。

与另外三个纯构建期插件不同，`@uno-pc/reactivue` 是「编译期转换 + 运行时」组合：插件负责把 `defineComponent` 的 JSX 切块并消费 `v-memo`，运行时提供 setup 缓存、props 桥、统一事务调度与块组件。

## 功能说明

| 能力 | 说明 |
| --- | --- |
| `defineComponent(setup)` | setup 只执行一次；推荐返回 JSX（注册插件后编译为可重复求值的 render thunk）。 |
| `ref` / `computed` / `reactive` | 直接来自 `@vue/reactivity`，语义与 Vue 一致。 |
| 文本通道 `TextBinding` | 文本插值编译为直写 `Text.nodeValue` 的绑定：零 `useSyncExternalStore`、零 React 重渲染，同 task 多次写入合并。 |
| 结构通道 `Block` | 复杂表达式 / 动态属性元素编译为独立订阅块，更新只重渲染该块（一个块一个 fiber）。 |
| `v-memo={[deps]}` | 编译为 `MemoBlock`。语义是「额外触发源」，与 Vue 原语义相反（见下文语义差异）。 |
| 生命周期 | `onBeforeMount` / `onMounted` / `onBeforeUpdate` / `onUpdated` / `onBeforeUnmount` / `onUnmounted`。 |
| props 桥 | React 宿主重渲染后 commit 阶段同步进 reactive props，依赖 props 的块自动更新。 |
| `./compat` | `vue` 的 alias 目标：让 VueUse 等纯组合式函数库直接在 React 中复用。 |
| 构建工具入口 | 导出 `ReactivueVite` 与 `ReactivueRsbuild`。 |
| 降级路径 | 未注册插件时 `defineComponent` 整体退化为一个块，功能正确但无细粒度收益。 |

## 安装与配置

### 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- React `>=19`

### 安装

```sh
pnpm add @uno-pc/reactivue @vue/reactivity
# 插件从子路径导入，无需额外安装
```

### 在 Rsbuild 中启用

```ts
// rstack.config.ts
import { define } from "rstack";
import { ReactivueRsbuild } from "@uno-pc/reactivue/rsbuild";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      pluginReact(),
      ReactivueRsbuild(),
      // 若同时使用 JSX 指令插件：
      JsxDirectiveRsbuild(),
    ],
  };
});
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { ReactivueVite } from "@uno-pc/reactivue/vite";

export default defineConfig({
  plugins: [ReactivueVite()],
});
```

### 插件顺序约定（正确性约定）

若同时使用 `@uno-pc/jsx-directive`：reactivue 插件必须**先**运行并消费全部 `v-memo`；jsx-directive 后运行时若仍看到 `v-memo` 会编译期报错。

顺序不依赖注册先后：reactivue 插件固定 `pre` 档，jsx-directive 插件固定 default 档，`pre` 恒先于 `default`（Rsbuild 的多个 `pre` transform 按注册逆序执行，因此不能靠注册顺序保证）。两包之间没有 import 边。

### 自动注入的 alias

插件默认注入 `vue`、`@vue/runtime-dom` → `@uno-pc/reactivue/compat`；`@vue/reactivity` 保持官方实现不 alias。可用 `alias: false` 关闭。

## 用法

```tsx
import { defineComponent, ref, computed, onMounted } from "@uno-pc/reactivue";

export const Counter = defineComponent<{ initial: number }>((props) => {
  const count = ref(props.initial);
  const doubled = computed(() => count.value * 2);
  onMounted(() => console.log("mounted"));

  // setup 只跑一次，返回 JSX（插件编译为 render thunk）。
  return (
    <main>
      <h1>{count.value}</h1>
      <p>{doubled.value}</p>
      <button onClick={() => (count.value += 1)}>+1</button>
    </main>
  );
});
```

编译插件启用后，源码会被改写为如下形态：

```tsx
// 产物
import { TextBinding as _TextBinding, createCompiledHost as _createCompiledHost } from '@uno-pc/reactivue/internal';
const Counter = _createCompiledHost((props) => ({ render: () => (
  <main>
    <h1><_TextBinding value={() => count.value} /></h1>
    {/* ... */}
  </main>
) }));
```

切块范围：文本插值 → `_TextBinding`；含 JSX / 箭头函数 / 对象 / 数组的复杂表达式、带动态属性的元素 → `_Block`；`v-memo` → `_MemoBlock`。条件 / 列表 / 嵌套 JSX 递归切分。**只在 `defineComponent` 内切块** —— 普通 React 组件里的非响应式局部变量没有 trigger，切开后会永不更新。

### setup 内不能使用 React hooks

setup 只执行一次、闭包永不重建，因此 setup 内**只能用本包 API 与 Vue 响应式 API**（含经 compat 的 VueUse 组合式函数），不能用 React hooks（`useContext` / `useNavigate` 等）。插件会检测从 `react` / `react-dom` 导入的 `use*` 调用并跳过该组件的切块（默认告警，`strict: true` 时编译期报错）。

## 语义差异（重要）

- **`v-memo={[a, b]}` 是「额外触发源」，不是 Vue 原语义**：刷新条件 = 块内自动收集的响应式依赖变化 ∪ deps 逐项 `Object.is` 变化。Vue 的 `v-memo` 是 deps 不变就跳过子树更新，方向相反；`v-memo={[]}` 在本包**不等价** `v-once`。
- **JSX 里 ref 不自动解包**：`enabled.value ? "ON" : "OFF"` 才是正确写法（Vue JSX 同语义，只有 SFC 模板才有自动解包）；`{enabled}` 会把 Ref 对象当真值。
- **`onUpdated`** 由「本宿主内任一动态块完成更新」触发，不是 React 组件重渲染。
- **`./compat` 的 `defineComponent`** 是 Vue 语义的 identity 函数，与主入口的 React 版同名不同义。
- **`getCurrentInstance()`** 返回精简元信息而非 Vue 组件实例；`emit()`、`app.component/directive/mixin`、依赖真实 Vue 渲染器的库不可用。

## VueUse 兼容

纯组合式函数库（VueUse 等）可直接复用：其内部 `import { ref, watch, ... } from "vue"` 经 alias 落到 `./compat`，响应式引擎就是 `@vue/reactivity` 本体，依赖收集与块订阅是同一套 trigger 链路。

```tsx
import { defineComponent } from "@uno-pc/reactivue";
import { useToggle, useNow } from "@vueuse/core";

const Demo = defineComponent(() => {
  const [enabled, toggle] = useToggle(false);
  return (
    <div>
      <button onClick={() => toggle()}>{enabled.value ? "ON" : "OFF"}</button>
    </div>
  );
});
```

首版只以 VueUse 纯组合式函数为目标；pinia 等依赖完整 Vue 运行时的库列入后续规划。

## 运行时行为

- 同一次写入同时命中文本与结构块时，文本写入挂起到结构块 commit 的同帧落地，保证零不一致帧；结构块被 React 延后时文本一起延后，**最坏多一帧延迟**（设计 §15 P-A 决议）。
- 纯文本路径**零 `useSyncExternalStore`、零 React 重渲染**，10 次同 task 写入合并为 1 次（同值 0 次）DOM 写。
- `granularity: "coarse"` 会把同 `groupKey` 的结构块合并为一次 bump：

```ts
import { configureTxn } from "@uno-pc/reactivue";
configureTxn({ granularity: "coarse" });
```

## 可运行示例

`examples/reactivue-all` 按 API 分块演示对照效果（详见 [/guide/examples](/guide/examples)），页面注入 react-scan，可直接观察「React 重渲染高亮 vs 文本直写无高亮」的对比。

## 已知限制

- 首版不生成 source map；HMR 沿用 React Fast Refresh 默认行为。
- 文本通道依赖一个隐藏 `<span>` 锚点定位 `Text` 节点；SSR 输出 `initialText` + 锚点，hydration 首屏值一致。
- `TextBinding` 收到对象值会降级为 `String()` 并在 DEV 告警。
- 结构块仍走 React render + reconcile，性能上限不超过「手工极致 memo 的 React」。
- 实测 benchmark（S1–S12）尚未执行，**不宣称任何性能提升倍数**。
