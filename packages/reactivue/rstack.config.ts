import { define } from "rstack";
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
