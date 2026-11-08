# @uno-pc/signals-transform

Preact Signals React 的编译期转换插件。功能完全等同于官方`@preact/signals-react-transform`插件，只是单纯不想使用babel而已。

## 功能说明

插件使用 Rust 在构建期为符合条件的函数组件或自定义 Hook 注入 `useSignals` 调用，并用 `try/finally` 确保信号跟踪在函数退出时结束。业务代码中只需访问 `.value`，无需手工包裹组件或调用运行时 Hook。

| 能力            | 说明                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 自动跟踪注入    | 检测信号访问，自动导入配置的运行时 Hook 并注入调用。                                                                                            |
| 三种模式        | `auto` 自动检测、`manual` 仅转换带标记的函数、`all` 转换所有包含 JSX 的组件。                                                                   |
| 显式控制        | `@useSignals` 启用、`@noUseSignals` 排除，后者优先。                                                                                            |
| 已编译 JSX 识别 | `detectTransformedJSX` 可识别 `jsx`、`jsxs`、`jsxDEV`、`createElement` 等调用。                                                                 |
| 构建工具入口    | 导出 `SignalsTransformPluginVite` 与 `SignalsTransformPluginRsbuild`；包根入口另导出 `transformSignals`、`getSignalsFormats`、`reportWarnings` 及相关类型。 |
| 转换时机        | Vite 插件 `enforce: "pre"`，Rsbuild 插件 `order: "pre"`。                                                                                       |
| 默认处理范围    | `.js`、`.jsx`、`.ts`、`.tsx`。                                                                                                                  |

### 转换规则

- `auto` 模式下，函数组件需以大写字母开头、包含 JSX，并访问信号的 `.value`；自定义 Hook 需符合 `useXxx` 命名形式。
- `manual` 模式下，没有 `@useSignals` 标记的函数不会转换；`all` 模式会转换包含 JSX 的组件，即使未检测到信号访问。
- 当函数体内存在符合规则的信号访问时，转换会自动导入配置的运行时 Hook。
- `@noUseSignals` 优先于 `@useSignals`。

```tsx
/** @useSignals */
function Counter() {
  return <p>{count.value}</p>;
}

/** @noUseSignals */
function StaticCounter() {
  return <p>静态内容</p>;
}
```

## 安装与配置

### 环境要求

- Node.js `>=22.12.0`
- Vite `^6`、`^7` 或 `^8`，或 Rsbuild `>=2.3.0 <3`
- 应用需安装 `@preact/signals-react`

### 安装

```sh
pnpm add -D @uno-pc/signals-transform
pnpm add @preact/signals-react
```

注册插件即启用转换；配置对象可以省略。

### 在 Rsbuild 中启用

```ts
// rstack.config.ts
import { define } from "rstack";
import { SignalsTransformPluginRsbuild } from "@uno-pc/signals-transform/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [pluginReact(), SignalsTransformPluginRsbuild({ mode: "auto" })],
  };
});
```

### 在 Vite 中启用

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { SignalsTransformPluginVite } from "@uno-pc/signals-transform/vite";

export default defineConfig({
  plugins: [
    SignalsTransformPluginVite({
      mode: "auto",
      importSource: "@preact/signals-react/runtime",
    }),
  ],
});
```

### 配置项

| 配置项                 | 默认值                            | 说明                                                                                                       |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `mode`                 | `"auto"`                          | `"auto"` 自动检测信号访问；`"manual"` 仅转换带 `@useSignals` 标记的函数；`"all"` 转换所有包含 JSX 的组件。 |
| `importSource`         | `"@preact/signals-react/runtime"` | `useSignals` Hook 的导入模块。                                                                             |
| `detectTransformedJSX` | `false`                           | 同时识别 `jsx`、`jsxs`、`jsxDEV`、`createElement` 等已编译 JSX 调用。                                      |
| `formats`              | `["js", "jsx", "ts", "tsx"]`      | 处理的扩展名，可带或不带开头的点。                                                                         |

## 完整使用示例

以下代码来自可运行示例 [`examples/signals-transform-all`](/guide/examples)，演示 `auto` 模式下组件自动获得信号跟踪能力，并用一个自定义 Hook 展示派生值。

### 构建配置 `rstack.config.ts`

```ts
import { define } from "rstack";
import { SignalsTransformPluginRsbuild } from "@uno-pc/signals-transform/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      pluginReact(),
      SignalsTransformPluginRsbuild({
        mode: "auto",
        importSource: "@preact/signals-react/runtime",
        formats: ["js", "jsx", "ts", "tsx"],
      }),
    ],
  };
});
```

### `src/App.tsx`

```tsx
import { signal, computed } from "@preact/signals-react";
import "./App.css";

const count = signal(0);
const double = computed(() => count.value * 2);
let appRender = 0;
export default function App() {
  appRender++;
  return (
    <main
      className="content"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        border: "1px solid green",
      }}
    >
      <div>
        <h1>Signals 编译期转换示例</h1>
        <div className="toolbar">
          <button
            onClick={() => {
              count.value += 1;
            }}
          >
            +1
          </button>
          <button
            onClick={() => {
              count.value = 0;
            }}
          >
            重置
          </button>
        </div>
        <p>父组件渲染次数：{appRender}</p>
      </div>
      <TextRenderNode />
      <TextNoRenderNode />
    </main>
  );
}
// 组件级重渲染
let textRenderNodeRender = 0;
const TextRenderNode = () => {
  textRenderNodeRender++;
  return (
    <div style={{ border: "1px solid red", padding: 10 }}>
      <div>预期：当前组件自身整体进行渲染-不影响其他组件渲染</div>
      <div>组件渲染次数：{textRenderNodeRender}</div>
      <div>原值：{count.value}</div>
      <div>计算值：{double.value}</div>
    </div>
  );
};

// 文本节点优化-不造成组件重渲染
let textNoRenderNodeRender = 0;
const TextNoRenderNode = () => {
  textNoRenderNodeRender++;
  return (
    <div style={{ border: "1px solid blue", padding: 10 }}>
      <div>
        预期：当前组件文本节点自行渲染-所处组件不进行渲染-不影响其他组件渲染
      </div>
      <div>文本节点优化组件渲染次数：{textNoRenderNodeRender}</div>
      <div>原值：{count}</div>
      <div>计算值：{double}</div>
    </div>
  );
};
```

`TextRenderNode` 以大写字母开头、包含 JSX 并访问 `count.value`，在 `auto` 模式下会被自动注入 `useSignals`；组件代码中没有出现任何跟踪相关的样板代码。等价的转换结果形态如下（示意）：

```tsx
import { useSignals as _useSignals } from "@preact/signals-react/runtime";

const TextRenderNode = () => {
  var _effect = _useSignals(1);
  try {
    // 原函数体
  } finally {
    _effect.f();
  }
};
```

### 运行与观察

```sh
cd examples/signals-transform-all
pnpm dev
```

点击 `+1`，计数与派生值同步更新；若未注入 `useSignals`，页面不会随 `.value` 变化重渲染。执行 `pnpm build` 后，JS 产物包含 `@preact/signals-react/runtime` 运行时代码与 `try` / `finally` 结构；生产压缩会重命名 `useSignals`，如需查看注入后的源码，可调用插件导出的核心 API `transformSignals`。把 `mode` 依次改为 `manual` 与 `all`，可对比三种模式的转换差异。

## 转换约束

- `auto` 模式依赖函数命名与 JSX 结构：组件名需大写开头并包含 JSX，自定义 Hook 需符合 `useXxx` 形式。不满足时可用 `@useSignals` 显式标记，或改用 `all` 模式。
- `@noUseSignals` 优先于 `@useSignals`。
- 转换会自动导入 `importSource` 指定的运行时 Hook，因此应用必须安装 `@preact/signals-react`。
- 默认处理 `.js`、`.jsx`、`.ts`、`.tsx`；其它扩展名需通过 `formats` 配置。

## 可运行示例

完整项目见[可运行示例](/guide/examples)中的 `examples/signals-transform-all`，可直接启动并观察信号驱动的更新效果。
