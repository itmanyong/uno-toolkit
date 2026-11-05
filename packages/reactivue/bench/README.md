# @uno-pc/reactivue benchmark

设计文档 §10.3 / §14 / §15 定义的 S1–S12 场景基准。**所有产出仅为原始数据，不宣称提升倍数**；准入判定见设计文档 §14.6 / §15.7（须在生产构建 + 关闭 StrictMode 环境下取数，本目录当前数据不参与判定）。

## 运行

```bash
cd packages/reactivue
pnpm build:js        # 确保 dist 最新（完整构建用 pnpm build，含 native）
node bench/run.mjs   # exit 0，输出原始数据
```

依赖：jsdom（包 devDependency）+ 已构建 `dist/` + `react` / `react-dom` / `@vue/reactivity`。不修改 `src/`。

## 测量口径

- 耗时均为 `performance.now()` 墙钟差（ms），报告 mean / p50 / p95 / max。
- 每个场景正式采样前预热 10 次写入并排空微任务 / 等待 React commit，然后清零计数器。
- DOM 写次数：包装 jsdom `CharacterData.prototype.nodeValue` setter 统计。
- DOM 变更记录：`MutationObserver`（characterData / childList / attributes，subtree）。
- React 渲染次数：`<Profiler onRender>` commit 次数 + render 闭包计数（双口径，闭包为增量）。
- 「同 task 连续写」= 同一同步调用栈内完成全部赋值；文本通道经统一事务（§15.3）在同 task 微任务 flush，结构通道经 React 调度器在后续宏任务 commit。
- 已知结构性成本（S2 口径说明）：Block 每次 commit 闭包执行 3 次 —— txn flush 显式 `runner()` 重收集依赖、Block render 输出 JSX、无依赖 `useLayoutEffect` 重建 effect 时立即执行一次。

## 场景状态

| ID | 场景 | 主要观测 | 状态 | 所需环境 |
| --- | --- | --- | --- | --- |
| S1 | 单文本高频写入（1k 次/秒） | 文本同步路径、批量去重（§14.4 税 3 / §15.3） | **已实现**（run.mjs Round A/B/C） | jsdom + dist |
| S2 | 大组件仅 1 个动态文本；结构 vs 文本 | React commit 次数、端到端延迟 | **已实现**（Block + useState 基线对照） | jsdom + dist |
| S3 | 全量更新（k≈N） | 调度扇出是否 regress（§14.5）；`C_rv / C_react` | **已实现**（commit 恒 1，扇出不 regress） | jsdom + dist |
| S4 | 1k 项 keyed 列表 | R6 边界、内存、fiber 数 | **已实现**（heap 为 jsdom 参考值；fiber 数需浏览器） | jsdom + dist |
| S5 | 同一次写入命中 文本 + 属性块 | tearing / 帧内一致性（R12，§15.7 rAF 口径） | **已实现**（分离帧 0） | jsdom + dist（rAF 由 pretendToBeVisual 提供） |
| S6 | SSR 输出 + hydration | 锚点字节、hydration 耗时、首屏值一致 | 骨架（输出形态已由 tests/ssr.test.tsx 覆盖；hydration 耗时待浏览器口径） | Node + jsdom |
| S7 | startTransition / Suspense 下重复 S5 | 并发渲染下的时序窗口 | **已实现**（分离帧 0；Suspense 变体待补） | jsdom 可跑 |
| S8 | 父级传入新 props 驱动更新 | props 桥（§14.4 税 2）是否多一次 commit | **已实现**（30 轮全部 1 commit，未观测到分离） | jsdom + dist |
| S9 | 同一事件内连续 10 次写，同值 / 异值两组 | DOM 写次数与 MutationObserver 记录数（判据：异值 ≤2、同值 0，§15.7） | **已实现**（双组 PASS） | jsdom + dist |
| S10 | 动态依赖切换（条件分支先后读不同 ref） | runner() 重收集后订阅集合正确、旧 dep 残留 | **已实现**（PASS） | jsdom + dist |
| S11 | startTransition 下结构块被丢弃 / 卸载 | React restart 次数、blocking 降级、最坏延迟帧、文本是否饿死（§15.3 兜底） | **部分实现**（卸载竞态 PASS；restart 计数需浏览器口径） | jsdom 可跑 |
| S12 | k≈N 下切换 granularity 三档 | `C_rv / C_react` 曲线，拟合 `c_b / t_r`、`D_max`、`N_min` | **运行时部分已实现**（三档 × m 全部 m/m 更新、commit 1；编译产物对比与常数拟合待做） | jsdom + dist（拟合需编译产物） |

## S3–S12 实施注意事项

- S5 / S7 / S11 的「帧内一致性」按 §15.7 定义：收集一次写入后到下一帧 rAF 之间的全部 MutationObserver 记录，`characterData` 与 `attributes` 未落在同一 rAF 区间即一个不一致帧。
- S3 / S12 拟合 `c_b / t_r` 时需扫 `m`（块数）与 `k`（命中块数）两个维度，避免单点拟合。
- S12 的三档 granularity 依赖编译期产物差异，run.mjs（纯运行时）无法覆盖，需在 examples/reactivue-all 或独立 fixture 构建后对比。
- 判定数据必须在生产构建 + 关闭 StrictMode 下取数；开发态数据单独记录。
- **2026-11-05：S12 首轮运行暴露 coarse 丢更新缺陷**（同 groupKey 块在 flush 去重时仅保留第一个 cell），已修复并更新回归测试；修复后三档全部 m/m 更新、commit 1 次。
