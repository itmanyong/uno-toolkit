---
pageType: home
title: Uno Toolkit
titleSuffix: 构建期转换插件使用文档
hero:
  name: Uno Toolkit
  text: 把样板代码留在构建阶段
  tagline: 三个编译期转换插件覆盖 JSX 条件指令、CSS 样式分层与 Signals 自动跟踪；@uno-pc/reactivue 在 React 19 上提供 Vue 3 composition API 与细粒度块更新
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 插件文档
      link: /plugins/jsx-directive
    - theme: alt
      text: 可运行示例
      link: /guide/examples
features:
  - title: "@uno-pc/jsx-directive"
    details: 用 v-if / v-else-if / v-else 与 v-show 编写 React 条件渲染，构建期转换为等价表达式。
  - title: "@uno-pc/style-layer"
    details: 把 CSS 自动归入指定的 Cascade Layer，并为 @import 注入 layer(name)。
  - title: "@uno-pc/signals-transform"
    details: 自动为组件与自定义 Hook 注入 useSignals，业务代码只需访问 .value。
  - title: "@uno-pc/reactivue"
    details: 在 React 19 上用 ref / computed / VueUse 组合式函数，编译期切块让文本更新直写 DOM、零 React 重渲染。
  - title: "可运行示例"
    details: 四个独立示例项目分别演示完整用法，可直接启动并查看构建产物中的转换结果。
---

## 资源

- 📖 在线文档：<https://itmanyong.github.io/uno-toolkit/>

- 包：
  - **@uno-pc/jsx-directive** — [npm](https://www.npmjs.com/package/@uno-pc/jsx-directive) · [npmx](https://npmx.dev/package/@uno-pc/jsx-directive)
  - **@uno-pc/style-layer** — [npm](https://www.npmjs.com/package/@uno-pc/style-layer) · [npmx](https://npmx.dev/package/@uno-pc/style-layer)
  - **@uno-pc/signals-transform** — [npm](https://www.npmjs.com/package/@uno-pc/signals-transform) · [npmx](https://npmx.dev/package/@uno-pc/signals-transform)
  - **@uno-pc/reactivue** — [npm](https://www.npmjs.com/package/@uno-pc/reactivue) · [npmx](https://npmx.dev/package/@uno-pc/reactivue)
