# @uno-pc/reactivue 浏览器判定口径取数（2026-11-05）

> 判定口径：**生产构建产物（dist/index.js）+ 无 StrictMode + 真实浏览器（Chrome 156, Windows 11）**。
> 只报原始数据，不做倍数宣称；拟合结果为**初步拟合，非正式验收**。
> 页面内 `performance.now()` 采样；经 COOP/COEP 启用 crossOriginIsolated，计时分辨率 5µs。
> fixture：`bench/browser-fixture/`（rsbuild 生产构建，`rs preview --port 4173` 服务 dist）。

## 环境

- 浏览器：Chrome 156.0.0.0（Windows 11 Pro for Workstations），crossOriginIsolated=true
- React 19.3.1 / react-dom 19.3.1（生产 build，无 StrictMode）
- @vue/reactivity 3.5.44；产物 dist/index.js（本次未重建，取现有构建）
- DOM 写计数：包装 `Node.prototype.nodeValue` setter（Chrome 中 nodeValue 位于 Node.prototype；与 run.mjs 的 jsdom 包装点不同）
- React commit 次数：**受限** —— 生产 build 非 profiling 构建，`React.Profiler` onRender 不触发，全程 commit 计数为 0；以 render 闭包计数（Block render / 组件函数体计数）+ MutationObserver 记录数作为替代口径。
- 等待 commit 的轮询用 MessageChannel 宏任务（≈0.1ms 分辨率）。早期版本用 `setTimeout(1)` 轮询，被 Chrome 嵌套定时器 4ms 钳制污染（见 §附录·方法学），已全部替换重测。

---

## S1 · 文本通道高频写（TextBinding，#s1）

| 指标 | 数值 |
|---|---|
| Round A：同 task 1000 次异值写·调度耗时 | 0.28 ms（摊销 0.28 µs/写） |
| Round A：写入→flush 落地端到端 | 0.34 ms |
| Round A：DOM nodeValue 写次数 | **1**（微任务合并，理论 ≤1 ✅） |
| Round A：MutationObserver 记录 | 1；React commit（替代口径：render 闭包/MO）0 |
| Round A：最终 nodeValue | "1000" ✅ |
| Round B：同 task 1000 次同值写（预置 42） | DOM 写 **0**（值级抑制 ✅），MO 0，调度 0.035 ms |
| Round C：单写 100 轮·写入→nodeValue 落地延迟 | mean **0.00305 ms** / p50 0.000 / p95 0.010 / max 0.025 |
| Round C：单次调度（同步）成本 | mean 0.00055 ms |
| Round C：DOM 写总次数 | 100/100（每轮 1 次 ✅）；commit 0 |
| Round C：最终值 | "100099" ✅ |

---

## S2 · 结构通道 vs useState 基线（复杂表达式 24 段，#s2-block / #s2-state）

### Round A（同 task 1000 次异值写，等待 commit 后采样）

| 指标 | s2-block（结构通道） | s2-state（useState 基线） |
|---|---|---|
| 写循环耗时 | 0.36 ms | 0.51 ms |
| 写入→DOM commit 端到端 | 1.43 ms | 0.64 ms |
| commit 等待段 | 1.07 ms | 0.13 ms |
| render 闭包增量 | **1002**（≈1/write，见诊断） | 1（批处理 ✅） |
| DOM nodeValue 写次数 | 1 | 1 |
| MO 记录 | 1 | 1 |

**诊断（round-03b，细粒度采样）**：写循环内 render 闭包执行 0 次；排空微任务后 1002 次 + DOM 写 1 次。即事务 flush 在单次微任务内对每个排队写各执行一次 render 闭包（重收集），而 React commit/DOM 落地仅 1 次。与 jsdom 口径（增量 ≈3/commit）存在实现路径差异，此处只报原始观测。

### Round C（单写 100 轮，每轮等待 commit）

| 指标 | s2-block | s2-state |
|---|---|---|
| 写入→DOM commit 延迟 mean | **0.0295 ms** | 0.0273 ms |
| p50 / p95 / max | 0.025 / 0.050 / 0.285 | 0.025 / 0.040 / 0.050 |
| render 闭包总数 | 300（3/轮） | 100（1/轮） |
| DOM 写总数 | 100 ✅ | 100 ✅ |

---

## S3 · m 块扇出（m∈{8,32,128}，20 轮单写）

| 场景 | 端到端 mean | p50 | p95 | max | DOM 写总数 | render 闭包增量 |
|---|---|---|---|---|---|---|
| s3-text-8 | 0.00625 ms | 0.005 | 0.030 | 0.030 | 160（=20×8 ✅） | — |
| s3-text-32 | 0.01775 ms | 0.015 | 0.070 | 0.070 | 640（=20×32 ✅） | — |
| s3-text-128 | 0.04775 ms | 0.045 | 0.110 | 0.110 | 2560（=20×128 ✅） | — |
| s3-block-8 | 0.0845 ms | 0.055 | 0.430 | 0.430 | 160 | 480（=3×8×20） |
| s3-block-32 | 0.1200 ms | 0.105 | 0.420 | 0.420 | 640 | 1920（=3×32×20） |
| s3-block-128 | 0.3608 ms | 0.340 | 1.125 | 1.125 | 2560 | 7680（=3×128×20） |

- 文本通道每块边际成本 ≈ (47.75−6.25)µs / 120 ≈ **0.35 µs/块**，线性。
- 结构通道每块边际成本 ≈ (360.75−84.5)µs / 120 ≈ **2.3 µs/块**，线性。
- React commit 次数（Profiler）不可用（生产 build），以 render 闭包 3×块数/轮 与 MO 记录数 = 块数为替代口径。

---

## S5 · 同一写入命中 文本 + 属性块（帧内一致性，#s5，50 轮）

| 指标 | 数值 |
|---|---|
| 采样帧 | 50/50（无空帧） |
| 不一致帧（文本/属性分离） | **0**（P-A 设计判据 ✅） |
| 帧内属性已落地 | 50/50 |
| 帧内文本已落地 | 50/50 |
| 帧记录构成 | 每帧 3 条（1 characterData + 属性类） |

注：单帧 e2e ≈37.5ms 为「写入→下一 rAF」的帧边界等待（口径含一次 vsync），非更新成本。

---

## S12 · granularity 三档 × m 扇出（#s12-{fine|balanced|coarse}-{8|32|128}，20 轮/配置）

每配置端到端（write → 全部 m 块显示新值，MessageChannel 轮询）与微任务段（write → drain）：

| 配置 | e2e mean (ms) | e2e p50 | e2e p95 | 微任务段 mean (ms) | 更新到的块 | 每轮 MO 记录 |
|---|---|---|---|---|---|---|
| fine-8 | 0.0418 | 0.035 | 0.135 | 0.0358 | 8/8 ✅ | 8（全部轮=m） |
| fine-32 | 0.0985 | 0.080 | 0.180 | 0.0808 | 32/32 ✅ | 32 |
| fine-128 | 0.2925 | 0.255 | 0.920 | 0.2478 | 128/128 ✅ | 128 |
| balanced-8 | 0.0378 | 0.030 | 0.120 | 0.0318 | 8/8 ✅ | 8 |
| balanced-32 | 0.0878 | 0.075 | 0.200 | 0.0760 | 32/32 ✅ | 32 |
| balanced-128 | 0.2558 | 0.220 | 0.410 | 0.2215 | 128/128 ✅ | 128 |
| coarse-8 | 0.0473 | 0.040 | 0.315 | 0.0415 | 8/8 ✅ | 8 |
| coarse-32 | 0.1010 | 0.090 | 0.460 | 0.0885 | 32/32 ✅ | 32 |
| coarse-128 | 0.2210 | 0.190 | 0.420 | 0.1898 | 128/128 ✅ | 128 |

- **三档 granularity × 全部 m 下均无丢更新**（updatedCount = m、每轮 MO 记录 = m，20/20 轮稳定）。coarse 同 groupKey 未观察到同组丢更新。

### 初步拟合（最小二乘，T(m) = c_b·m + t_r；n=3 点/档）

> ⚠️ 初步拟合，非正式验收。模型假设：单写命中 m 块、1 次提交，端到端 = 单块边际成本 × m + 固定调度/提交开销。c_b 为「单块 bump+重渲染边际成本」量级，t_r 为「单次提交固定开销」量级；二者不可与设计文档常数直接等同（口径含轮询粒度 ≈0.1ms 与调度抖动）。

| 档位 | 拟合点 (m, e2e mean ms) | c_b (ms/块) | t_r (ms) | R² |
|---|---|---|---|---|
| fine | (8, 0.0418) (32, 0.0985) (128, 0.2925) | **0.00207** | 0.0283 | 0.9993 |
| balanced | (8, 0.0378) (32, 0.0878) (128, 0.2558) | **0.00180** | 0.0264 | 0.9991 |
| coarse | (8, 0.0473) (32, 0.1010) (128, 0.2210) | **0.00139** | 0.0452 | 0.9864 |

辅助点（s3-block，同型线性）：(8, 0.0845) (32, 0.1200) (128, 0.3608)，斜率 ≈0.0023 ms/块。
三档线性拟合 R² ≥0.986：**m 增长下未见显著超线性**。

---

## S6 · hydration 实测（ssr.html = renderToString 产物 + hydrateRoot）

服务端输出：`<div><p>21<span hidden="" data-rv-anchor=""></span></p><div class="lv-21" data-v="21">attr</div></div>`

| 指标 | 数值 |
|---|---|
| hydrateRoot 同步调用耗时 | **0.18 ms** |
| hydration 首个 commit 落定（effect 触发） | **12.02 ms**（含 React 调度延迟） |
| 首屏 innerHTML 与服务端输出一致 | **true** ✅（逐字符相等） |
| hydrate 后写入 write(999) 端到端 | 0.28 ms |
| hydrate 后写入仍直写 | **是**：DOM nodeValue 写 1 次，文本变 "999" ✅ |
| 属性块 hydrate 后更新 | data-v="999"、class="lv-999" ✅ |
| 直写锚点 | 存在且 hidden ✅ |

---

## S11 · startTransition 高频写入（restart 观测，#s11，m=32 结构块）

> **受限**：restart 精确计数无法从页面口径获取（无暴露 API），用「全部块到达最终值的端到端延迟 + DOM 写次数 + 中间值可见性」代替。

| 指标 | Round A：单 transition 内 50 次连续写 | Round C：50 个 transition 连发 |
|---|---|---|
| 调度耗时 | 0.24 ms | 0.085 ms |
| 写入→全部块到达最终值 e2e | **0.885 ms** | **0.435 ms** |
| 最终一致性 | 32/32 块 = 5050 ✅ | 32/32 块 = 700049 ✅ |
| 中间值（5040 / 700000）可见块数 | 0（未见中间提交落地） | 0 |
| DOM nodeValue 写次数 | 32（=块数，非 50×32） | 32 |
| MO 记录 | 32 | 32 |

Round B（30 轮单写 transition，每轮等待全部块更新）：e2e mean **0.134 ms** / p50 0.105 / p95 0.475 / max 0.495；DOM 写总数 960（=30×32 ✅）。

观测：高频 transition 写入下结构块更新最终一致，中间状态未落地为 DOM（合并/restart 后仅最终值提交，DOM 写次数 = 块数），无丢更新、无饿死。

---

## 冗余 _Block 成本决策数据（供 §14.6/§15.7 决策，非结论）

问题：块数量 m 增长时，每块边际成本是否超线性（若是，冗余聚合优化才有收益空间）。

原始边际成本（相邻 m 点差分）：

| 通道 | 8→32 | 32→128 | 线性拟合 R²（S12 fine/balanced/coarse） |
|---|---|---|---|
| 文本通道（s3-text） | 0.38 µs/块 | 0.37 µs/块 | —（纯直写） |
| 结构通道（s3-block） | 1.48 µs/块 | 3.01 µs/块 | — |
| S12 fine | 2.50 µs/块 | 2.44 µs/块 | 0.9993 |
| S12 balanced | 2.22 µs/块 | 2.10 µs/块 | 0.9991 |
| S12 coarse | 2.38 µs/块 | 1.50 µs/块 | 0.9864 |

- 结构通道 32→128 段边际（3.01 µs/块）高于 8→32 段（1.48 µs/块），但 S12 三档独立重测的线性拟合 R²≥0.986、且 p95 无雪崩（128 块 p95 最大 0.92ms），**未见显著超线性增长**。
- 数据支撑方向：在当前 m∈{8,32,128} 范围内，「冗余聚合优化可暂缓」与数据一致；若未来 m 进入 10²–10³ 量级再复测（本次未覆盖 m>128）。

---

## 完成项 / 受限项

**完成**：S1 / S2（Round A+Round C）/ S3 / S5 / S12（9 配置 + 初步拟合）/ S6（hydration）/ S11（观测口径）浏览器判定口径取数；冗余 _Block 决策数据。

**受限 / 口径说明**：
1. React Profiler onRender 在生产 build 不触发（非 profiling 构建），commit 次数以 render 闭包计数 + MO 记录数替代；commit 次数口径缺失。
2. restart 精确计数无页面口径，S11 用最终一致性 + 延迟 + DOM 写次数代替（未编造数字）。
3. S2 Round A 结构通道 render 闭包增量 1002（≈1/写）与 jsdom 口径（≈3/commit）存在实现路径差异，已如实记录（见 §S2 诊断）。
4. 早期一轮 S2/S3 延迟被 Chrome `setTimeout` 4ms 钳制污染，已用 MessageChannel 轮询重测并替换（方法学记录见 scripts/round-03b、附录）。
5. m>128 未覆盖；拟合仅 3 点/档，置信度有限。

## fixture 复现说明

- 位置：`bench/browser-fixture/`（不在 pnpm workspace globs 内，**未改 pnpm-workspace.yaml/lockfile**；复用 @uno-pc/reactivue 包工具链与依赖）。
- 构建（仓库根）：`pnpm --filter @uno-pc/reactivue exec rs build --config bench/browser-fixture/rstack.config.ts`
- SSR 页生成：`cd packages/reactivue && node bench/browser-fixture/scripts/ssr-generate.mjs`（产出 dist/ssr.html）
- 预览：`pnpm --filter @uno-pc/reactivue exec rs preview --config bench/browser-fixture/rstack.config.ts --port 4173`（COOP/COEP 头启用 crossOriginIsolated）
- 取数脚本：`bench/browser-fixture/scripts/round-0*.mjs`（ego-browser nodejs 执行；taskSpace 名 `reactivue-bench-browser-2026-11-05`）
- 场景切换：URL hash（`#s1`、`#s2-block`、`#s3-block-32`、`#s5`、`#s11`、`#s12-coarse-128`…）
