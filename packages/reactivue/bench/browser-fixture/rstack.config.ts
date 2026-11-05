/**
 * 浏览器判定口径 benchmark fixture 的 rsbuild 配置。
 *
 * 判定口径要求：
 * - 生产构建（rs build 默认 production，React 为 production build）；
 * - 不启用 StrictMode（pluginReact() 默认不包 StrictMode，符合要求）；
 * - 不需要 source map。
 *
 * 说明：fixture 位于 packages/reactivue/bench 下（不在 pnpm workspace globs 内），
 * 由 @uno-pc/reactivue 包的 rstack 工具链以 --config 方式构建；
 * 依赖（react / @rsbuild/plugin-react / rstack 等）经 Node 模块上溯解析自
 * packages/reactivue/node_modules；@uno-pc/reactivue 经包内 self-reference 命中
 * dist/index.js 生产产物。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { define } from "rstack";
import { pluginReact } from "@rsbuild/plugin-react";
import { ReactivueRsbuild } from "@uno-pc/reactivue/rsbuild";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

export default define.app(() => ({
  output: {
    distPath: { root: path.resolve(fixtureDir, "dist") },
    sourceMap: false,
  },
  source: {
    entry: {
      index: path.resolve(fixtureDir, "src/index.ts"),
    },
  },
  resolve: {
    alias: {
      // rspack 不支持 package self-reference，显式指向生产构建产物（判定口径要求）
      "@uno-pc/reactivue": path.resolve(fixtureDir, "../../dist/index.js"),
    },
  },
  plugins: [pluginReact(), ReactivueRsbuild()],
  html: {
    title: "reactivue browser bench fixture",
  },
  server: {
    port: 4173,
    // COOP/COEP 启用 crossOriginIsolated，解除 Chrome 对 performance.now() 的
    // 100µs 计时粗化（隔离后分辨率 5µs），保证单写端到端延迟分布可测。
    headers: {
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
    },
  },
}));
