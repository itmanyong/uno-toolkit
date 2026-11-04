# uno-toolkit

基于 pnpm workspace 与 Rstack CLI 的工具包 monorepo。

## Packages

| 包                                                                  | 说明                               |
| ------------------------------------------------------------------- | ---------------------------------- |
| [@uno-pc/jsx-directive](./packages/jsx-directive/README.md)         | React JSX 条件指令与显示控制转换。 |
| [@uno-pc/style-layer](./packages/style-layer/README.md)             | CSS Cascade Layers 样式分层转换。  |
| [@uno-pc/signals-transform](./packages/signals-transform/README.md) | Preact Signals React 编译期转换。  |

JavaScript 依赖版本由根目录 [pnpm-workspace.yaml](./pnpm-workspace.yaml) 中的 catalog 统一管理；各 workspace 包在自己的 `package.json` 声明所需依赖。
