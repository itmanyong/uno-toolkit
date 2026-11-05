// 该文件必须是模块，否则 `declare module "react"` 会变成环境模块声明并覆盖整个 react 类型。
import "react";

// React 19 的 @types/react 已移除全局 JSX 命名空间，改用模块增强。
// 与 @uno-pc/jsx-directive 的 Attributes 增强保持同型（零类型依赖，接口合并）。
interface ReactivueAttributes {
  "v-memo"?: unknown[];
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React 模块增强需要可合并的空接口。
  interface Attributes extends ReactivueAttributes {}
}
