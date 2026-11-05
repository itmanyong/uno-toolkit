---
"@uno-pc/reactivue": minor
---

新增 `useSetup(setup, reactProps?)` 与 `createSetup(setup)`：在普通 React 函数组件内使用组合式 API。setup 只跑一次并在独立实例作用域内运行（watch 随卸载释放、provide/inject 链与外层 defineComponent 连通）；返回值经 proxyRefs 解包（`state.count` 等价 `count.value`）；props 桥 render 阶段幂等同步（`ref(props.x)` 为初值快照，响应变化用 computed）；响应式写入经 deep traverse → 微任务 setTick 触发组件级重渲染（该 API 的更新粒度，不享受编译期切块）。生命周期可用且 StrictMode 安全。
