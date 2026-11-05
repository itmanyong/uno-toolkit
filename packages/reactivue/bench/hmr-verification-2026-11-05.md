# @uno-pc/reactivue HMR 状态保留验证（2026-11-05）

> 验证对象：待办清单（REACTIVUE-DESIGN.md §18.11）中「HMR 状态保留」项——「沿用 React Fast Refresh 默认行为」在 reactivue 组件上的实际表现。
> 方法：真实 dev server + 自动化浏览器逐场景操作，全程通过 CDP（`Network.enable` / `Runtime.enable`）捕获热更链路与 console，DOM 轮询判定生效。
> 性质：验证记录，不修复 src 代码。

## 环境

- 构建器：Rsbuild v2.3.0（`examples/reactivue-all` 下 `pnpm dev --port 4173`）
- Fast Refresh 实现：`rstack.config.ts` 含 `@rsbuild/plugin-react()`（内部走 `@rspack/plugin-react-refresh` 运行时，热更产物 import 已实证：`__webpack_require__("@rspack/plugin-reac...")`）
- HMR 传输：Rspack dev-server WebSocket。实测帧序：server → `{"type":"hash","data":"<hash>"}` → 客户端按需拉取 `index.<oldHash>.hot-update.json` / `.hot-update.js`（均 **200**）→ JSONP 执行 `self["rspackHotUpdatereactivue_all"]("index", {...})`。抓包核对热更产物内容：**包含新编译的模块代码（非陈旧缓存）**，JSX 文案、Fast Refresh 签名包装（`_s()`）与 `$ReactRefreshRuntime$` 注入齐全。
- React 19.3.1 / react-dom 19.3.1；@uno-pc/reactivue 为 workspace 源码构建
- 浏览器：ego-browser（ego lite 0.6.2）管理的 Chrome（Windows 11 Pro for Workstations）
- 页面初始 console：`[rsbuild] WebSocket connected.`，全程无 HMR 报错、无 React 报错、无 overlay

## 核心结论（一句话）

**沿用 React Fast Refresh 默认行为时，reactivue 组件的响应式状态跨热更新完整保留、UI 更新链路存活（无 remount、无报错），但模板/结构/setup 编辑在热更后不可达——render 输出绑定首次挂载时的 setup 闭包，需整页 reload 才应用新代码（reload 即全新挂载，状态归零）；同文件内纯 React 组件行为正常（状态保留 + 新代码生效）。**

## 根因定位

- Fast Refresh 链路本身完好：模块级热更送达并执行（对照组件文案即时更新为证），且 react-refresh 对已挂载 fiber 发起了强制重渲染（`HostRenderMeter` 渲染计数从 2 涨到 16 为证）。
- reactivue 宿主的 render 输出来自 `createHostInstance` 时捕获的 setup 闭包（`useHostInstance` 的 `useRef` 惰性初始化只跑一次，见 `src/react/Host.tsx:27-30`）。Fast Refresh 重渲染宿主组件时命中旧实例，`host.render()` 依旧产出旧模板——新模块的 setup 函数在已挂载实例上永远不会被执行。
- Fast Refresh 判定组件签名未变，不触发 remount（React 语义）；因此「编辑不可达」状态一直持续到手动 reload。
- 对照 §6.12 原表述「沿用 Fast Refresh 默认行为，即组件重挂载」：实测**并未发生重挂载**——既不重挂载也不热应用模板，而是保持旧渲染闭包。§18.15 已按实测修正表述。

---

## 场景 A（核心）：FineCounter 响应式状态在 Fast Refresh 后保留？

**操作**：点击 FineCounter +1 ×3（count=3，NaiveCounter +1 ×2 作为同文件对照）→ 修改 App.tsx 中 FineCounter 模板 `<p>count: {count.value}</p>` → `<p>计数: {count.value}</p>`（同组件 JSX 微改）→ 保存 → 轮询 DOM。

**观测**：

| 检查项 | 结果 |
|---|---|
| dev server 重建 | ✅ `building src\App.tsx → built in 0.02s`，WebSocket 推送新 hash |
| 热更产物交付 | ✅ `.hot-update.json` / `.hot-update.js` 均 200，内容含新编译模块 |
| 文案更新 | ❌ 5s 轮询超时；多轮重复编辑（计数/计数A/计数B/计数C）均不生效 |
| NaiveCounter 对照（同文件） | ✅ 文案即时更新（`ReactCount: 2`）且 count=2 保留 → Fast Refresh 工作正常 |
| Fast Refresh 是否重渲染了 reactivue 宿主 | ✅ 是（`宿主 React 渲染次数` 2 → 16），但重渲染输出仍是旧模板 |
| count 值保留 | ✅ count=3 未归零 |
| 更新链路存活 | ✅ 点击 +1 后 count 3→4（TextBinding 直写通道正常），无死 UI |
| console 错误 | 无 |
| 整页 reload 后 | ✅ 新模板生效（`计数C: 0`），count 归零（全新挂载，setup 重跑） |

**结论**：响应式状态保留（跨多次热更不丢）、UI 存活；但模板编辑**不热应用**——新代码在 reload 前对已挂载实例不可达。

## 场景 B：NaiveCounter 对照（React useState 基线）

**操作**：修改 NaiveCounter 模板 `count:` → `ReactCount:`，保存。

**观测**：文案即时更新为 `ReactCount: 2`，useState 值 2 保留。

**结论**：React 标准语义基线成立（state 保留 + 新代码生效），证明场景 A 的行为差异确系 reactivue 编译宿主特有，而非环境或 Fast Refresh 失效。

## 场景 C：结构变化（React 语义边界记录）

**C1 纯 React（NaiveCounter）JSX 追加元素**：新增 `<p>HMR-C-STRUCT-TEST</p>` 保存 → 元素**即时出现**，count=2 保留。Fast Refresh 对纯 JSX 结构变化不 remount。

**C2 reactivue（FineCounter）JSX 追加元素**：新增 `<p>HMR-C2-FINE-STRUCT-TEST</p>` 保存 → 5s 内**未出现**（同场景 A 机制）；点击 +1 链路存活（2→3）。

**结论**：React 语义边界在纯 React 组件上表现正常（结构变化不触发 remount）；reactivue 组件上新结构同样被旧 setup 闭包遮蔽，reload 前不可见。**未观测到任何 remount（状态重置）路径**。

## 场景 D：v-memo / useSetup / VueUse 组件的 HMR

**D1 MemoDemo（v-memo）**：先点「改 message」「epoch +1」建立状态（message=hello!，renderNonce=1）→ 修改模板文案（`普通块` → `普通块D`）→ 热更。

- 模板更新：❌ 未应用（同 A 机制）
- v-memo 机制存活：✅ 点 epoch +1 后 renderNonce 1→2（deps 变化整块刷新正常），message 状态 `hello!` 保留

**D2 VueUseDemo（useNow / useToggle）**：先 toggle 至 ON（12:01:59 起走秒）→ 修改模板（`useToggle:` → `useToggleD:`）→ 热更。

- 模板更新：❌ 未应用
- useNow 存活：✅ 热更后继续走秒（12:02:05 → 12:02:07，interval/watch effect 未中断）
- useToggle 存活：✅ 状态 ON 跨热更保留，且可再次点击切回 OFF

**结论**：所有响应式副作用（块订阅、watch/effect/interval）跨 Fast Refresh 完好；仅模板输出不可达。

## 场景 E：setup 逻辑改动

**操作**：FineCounter setup 内 `ref(0)` → `ref(100)`，保存（当时 count=3）。

**观测**：热更后 count 仍显示 3，点击 → 4；**100 未出现**（setup 未重跑）。整页 reload 后新 setup 生效：初始显示 `计数C: 100`。

**结论**：与预期一致——Fast Refresh 保留 hooks state（useRef 中的实例 → setup 不重跑），初始值改动不生效；新 setup 逻辑在 reload 前同样不可达。这与「setup 只跑一次」设计自洽，但意味着 dev 模式下 setup 的任何编辑（初始值、computed 定义、watch 逻辑）都需手动 reload 才可见。

---

## 汇总表

| 场景 | 组件类型 | 编辑内容 | state 保留 | 新代码热应用 | UI 存活 |
|---|---|---|---|---|---|
| A | reactivue（编译宿主） | 模板文案 | ✅ | ❌ | ✅ |
| B | 纯 React（useState） | 模板文案 | ✅ | ✅ | ✅ |
| C1 | 纯 React | JSX 加元素 | ✅ | ✅ | ✅ |
| C2 | reactivue | JSX 加元素 | ✅ | ❌ | ✅ |
| D1 | reactivue + v-memo | 模板文案 | ✅ | ❌ | ✅ |
| D2 | reactivue + VueUse | 模板文案 | ✅ | ❌ | ✅ |
| E | reactivue | setup 逻辑 | ✅ | ❌ | ✅ |

## 定性

- 「沿用 React Fast Refresh 默认行为」的实测语义：**状态保留达成（强于预期——连 remount 都不会发生），模板热应用未达成（弱于纯 React 基线）**。热更后的页面是一个「新模块已加载、旧闭包仍在渲染」的混合态，直到手动 reload。
- 对开发体验的影响：改模板/改 setup 后看不到变化且无任何提示（无报错、无 overlay），容易误判为「改了没保存」。这是本次验证发现的主要风险点。
- 可能的增强方向（不在本次范围）：热更时将新 setup 注入存活实例（替换 `host.render` 引用），或对 reactivue 组件族声明 `module.hot.invalidate` 触发可控 remount；均可复用 §7.1 的实例本地状态方案思路。
- 本报告只记录，不改 src。
