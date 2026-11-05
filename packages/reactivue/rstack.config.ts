import { define } from "rstack";
import { defineInlineProject } from "rstack/test";
import type { RstackConfig } from "rstack";
import { sharedLibConfig } from "../../rstack.lib.config";

import path from "node:path";

// 本包需要真实 DOM 验证 TextBinding 的 nodeValue 直写；只在包级覆盖，不动根配置。
// VueUse 兼容测试经 alias 把 `vue` 指向 ./src/compat —— 与插件注入的 alias 同型。
const domTestConfig: RstackConfig = {
  test: {
    testEnvironment: "jsdom",
  },
  resolve: {
    alias: {
      vue: path.resolve("./src/compat/index.ts"),
      "@vue/runtime-dom": path.resolve("./src/compat/index.ts"),
    },
  },
};

define.extends([sharedLibConfig, domTestConfig]);

// 双 project：dom 继承共享配置（jsdom + alias），node-ssr 覆盖为 node 环境
// 以覆盖 isServer === true 分支（无 window/document）。
// 每个 project 用 tools.swc 把测试编译切到 automatic JSX runtime，消除
// React 19 的 "outdated JSX transform" 警告（包 tsconfig 的 jsx: "react"
// 保持不动，避免影响库构建产物）。
const automaticJsx = {
  tools: {
    swc: {
      jsc: {
        transform: {
          react: {
            runtime: "automatic",
          },
        },
      },
    },
  },
} as const;

define.test({
  projects: [
    defineInlineProject({
      name: "dom",
      include: ["./tests/**/*.test.{ts,tsx}"],
      exclude: ["**/ssr.node.test.tsx"],
      testEnvironment: "jsdom",
      ...automaticJsx,
    }),
    defineInlineProject({
      name: "node-ssr",
      include: ["./tests/ssr.node.test.tsx"],
      testEnvironment: "node",
      ...automaticJsx,
    }),
  ],
});

// 包级 lint 不会自动继承根配置，显式声明与根一致的规则集。
define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommended]);

define.lib({
  source: {
    entry: {
      // 本包含 .tsx 运行时组件，入口 glob 需同时覆盖两种扩展名。
      index: ["./src/**/*.ts", "./src/**/*.tsx"],
    },
  },
});
