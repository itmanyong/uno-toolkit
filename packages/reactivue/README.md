# @uno-pc/reactivue

在 React 19 上使用 Vue 3 composition API：响应式层直接用 `@vue/reactivity`（`.value` 语义原样保留），编译期把 JSX 切成常驻订阅块，文本绑定绕过 React 直接写 `Text.nodeValue`。

设计依据见仓库根目录 `REACTIVUE-DESIGN.md`（§18 为最新落地记录，冲突处以 §18 为准）。

## 当前状态：P0–P3 已落地，P4 实测完成

| 阶段 | 状态 |
| --- | --- |
| P0 运行时核心（setup 只跑一次、props 桥、实例作用域、生命周期） | 已实现 + 单测 |
| P1 文本通道 `TextBinding`（T2 锚点直写 + 统一事务） | 已实现 + DOM 单测 |
| P2 结构通道 `Block` / `MemoBlock` / `defineComponent` | 已实现 + DOM 单测 |
| P3 Rust/tree-sitter 切块转换、`v-memo` 降低、hooks 检测 | 已实现 + Rust 17 / TS 8 快照单测 |
| P4 Vite / Rsbuild 插件、`./compat`、`./internal`、类型声明 | 已实现；`examples/reactivue-all` 构建通过 + VueUse 实测通过 |
| R-A 外壳（`jsx-directive` 残留 `v-memo` 编译期报错） | 已实现 + 两插件串联实测 |
| VueUse 兼容（纯组合式函数经 `./compat` 桥） | 已实现 + DOM 回归测试（useToggle / useNow） |

> 未注册插件时，`defineComponent` 走**降级路径**（整体一个 `Block`，组件级重渲染，功能正确但无细粒度收益）。注册插件后编译产物改由 `createCompiledHost` 接管，setup 仍只跑一次。

## 安装

```bash
pnpm add @uno-pc/reactivue @vue/reactivity
pnpm add -D @uno-pc/reactivue # 插件从子路径导入，无需额外包
```

## 用法

```tsx
import { defineComponent, ref, computed, onMounted } from "@uno-pc/reactivue";

export const Counter = defineComponent<{ initial: number }>((props) => {
  const count = ref(props.initial);
  const doubled = computed(() => count.value * 2);
  onMounted(() => console.log("mounted"));

  // setup 只跑一次，返回可重复求值的 render thunk。
  return () => (
    <main>
      <h1>{count.value}</h1>
      <p>{doubled.value}</p>
      <button onClick={() => (count.value += 1)}>+1</button>
    </main>
  );
});
```

**为什么 setup 返回 thunk**：thunk 捕获 setup 的局部变量，编译期因此无需做自由变量静态分析；但 setup 只跑一次、闭包永不重建，所以 setup 内**只能用本包 API 与 Vue 响应式 API**，不能用 React hooks（`useContext` / `useNavigate` / `useQuery` 等），普通局部变量的后续赋值对块不可见。

编译插件启用后，源码会被改写为如下形态（真实产物，已用 tree-sitter 重新解析校验合法）：

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

切块范围：文本插值 → `_TextBinding`（零 `useSyncExternalStore`）；含 JSX/函数/对象/数组的复杂表达式、带动态属性的元素 → `_Block`；`v-memo` → `_MemoBlock`；`<Block>` 是编译期强制边界标记。条件/列表/嵌套 JSX 递归切分。**只在 `defineComponent` 内切文本块** —— 普通 React 组件里的非响应式局部变量没有 trigger，切开后会永不更新。

## 插件注册

```ts
// vite.config.ts
import { ReactivueVite } from "@uno-pc/reactivue/vite";
import { JsxDirectiveVite } from "@uno-pc/jsx-directive/vite";

export default {
  plugins: [ReactivueVite({ granularity: "coarse" }), JsxDirectiveVite()],
};
```

**顺序是正确性约定**：本包插件必须先运行并消费全部 `v-memo`；`jsx-directive` 后运行时若仍看到 `v-memo` 会编译期报错。两包之间没有 import 边。顺序不靠注册顺序保证：Rsbuild 的多个 `order: "pre"` transform 按**注册逆序**执行（后注册先跑），因此本包插件用 `pre` 档、`jsx-directive` 用 default 档，`pre` 恒先于 `default`，与两者注册先后无关。

插件默认自动注入 alias：`vue`、`@vue/runtime-dom` → `@uno-pc/reactivue/compat`；`@vue/reactivity` 保持官方实现，不 alias。可用 `alias: false` 关闭。

## VueUse 兼容（./compat）

纯组合式函数库（VueUse 等）可直接复用：其内部 `import { ref, watch, ... } from "vue"` 经 alias 落到 `./compat`，响应式引擎就是 `@vue/reactivity` 本体，因此依赖收集与 React 侧的块订阅是同一套 trigger 链路。

```tsx
import { defineComponent } from "@uno-pc/reactivue";
import { useToggle, useNow } from "@vueuse/core";

const Demo = defineComponent(() => {
  const [enabled, toggle] = useToggle(false);
  const now = useNow();
  return () => (
    <div>
      {/* Vue JSX 语义：ref 不会像 SFC 模板那样自动解包，需显式 .value */}
      <button onClick={() => toggle()}>{enabled.value ? "ON" : "OFF"}</button>
      <p>{now.value.toLocaleTimeString()}</p>
    </div>
  );
});
```

实测通过的用例见 `tests/vueuse.test.tsx`（useToggle 交互更新、useNow 初始渲染）；完整示例见 `examples/reactivue-all`。compat 目前导出的 Vue API 以 VueUse 常用面为准，缺失导出会让 ESM linking 直接报错（补齐方式见 `src/compat/index.ts` 内的 stub 注释）。

## 语义差异（重要）

- **`v-memo={[a, b]}` 是「额外触发源」，不是 Vue 原语义**：刷新条件 = 块内自动收集的响应式依赖变化 ∪ deps 逐项 `Object.is` 变化。deps 中的响应式依赖（纯 ref、reactive props 等）由运行时显式订阅（微任务事务中比较，变化才整块刷新），与 Vue 的「deps 不变就跳过更新」方向相反；`v-memo={[]}` 在本包**不等价** `v-once`。
- **`onUpdated`** 由「本宿主内任一动态块完成更新」触发，不是 React 组件重渲染。
- **`./compat` 的 `defineComponent`** 是 Vue 语义的 identity 函数，与主入口的 React 版同名不同义。
- **`getCurrentInstance()`** 返回精简元信息而非 Vue 组件实例；`emit()`、`app.component/directive/mixin`、依赖真实 Vue 渲染器的库不可用。首版只以 VueUse 纯组合式函数为目标，pinia 列入规划。
- **JSX 里 ref 不自动解包**：`enabled.value ? "ON" : "OFF"` 才是正确写法（Vue JSX 同语义，只有 SFC 模板才有自动解包）；`{enabled}` 会把 Ref 对象当真值。同理 `{bool}` 在 React JSX 中渲染为空，需要 `String(bool)`。
- **hooks 检测按导入源识别**：setup 内「从 `react` / `react-dom` 导入的 `use*`」才判定为 React hooks 并跳过切块；VueUse 的 `useNow` 等不会误触发降级。

## 运行时行为（§15 决议）

- **P-A 已接受**：同一次写入同时命中文本与结构块时，文本写入会挂起到结构块 commit 的 layout effect 同帧落地，保证零不一致帧；若结构块被 React 延后，文本一起延后，**最坏多一帧延迟**。
- **P-B 首版已做**：`granularity: "coarse"` 会把同 `groupKey` 的结构块合并为一次 bump；`Block` 可选 `fingerprint` 做值级假阳性抑制。默认 `balanced`。
- 纯文本路径**零 `useSyncExternalStore`、零 React 重渲染**，10 次同 task 写入合并为 1 次（同值 0 次）DOM 写。

```ts
import { configureTxn } from "@uno-pc/reactivue";
configureTxn({ granularity: "coarse" });
```

## 已知限制

- 首版不生成 source map；HMR 沿用 React Fast Refresh 默认行为。
- 文本通道依赖一个隐藏 `<span>` 锚点定位 `Text` 节点；SSR 输出 `initialText` + 锚点，hydration 首屏值一致。
- `TextBinding` 收到对象值会降级为 `String()` 并在 DEV 告警。
- 结构块仍走 React render + reconcile，性能上限不超过「手工极致 memo 的 React」；项目级收益 = 覆盖率 × JS 占帧比（见设计 §14）。
- 实测 benchmark（S1–S12）尚未执行，**不宣称任何性能提升倍数**。
- `granularity: "coarse"` 已生成 `groupKey`；编译期**尚未生成** `fingerprint`（元素块输出是每次新建的 ReactElement，值级 `hasChanged` 恒失效，见设计 §15.5）。
- 非数组 `v-memo` 会消费属性、降级为 `_Block` 并告警（设计 §6.10 原为「保留源码」，R-A 下那样会触发误导性报错）。
- `defineComponent` 之外的 `v-memo` 消费为 `_MemoBlock` 并告警，块内不做文本切分。
- 嵌套 JSX 可能产出冗余 `_Block`；首版正确性优先，聚合阈值待 benchmark 拟合。
- `createCompiledHost` 在 render 阶段额外同步一次 props（供宿主层 `v-memo` deps 求值），并发 render 被丢弃时存在短暂窗口，见设计 §17.4。

## 目录

```
src/core/     实例作用域、setup 缓存/props 桥、统一事务调度
src/react/    Host / TextBinding / Block / MemoBlock / 生命周期
src/compat/   vue alias 目标
src/internal/ 编译产物专用入口
src/plugins/  Vite / Rsbuild 插件与 transform 封装
native-rust/  Rust + tree-sitter + napi（P3 切块）
```
