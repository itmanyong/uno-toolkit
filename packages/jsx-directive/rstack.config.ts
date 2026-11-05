import { define } from "rstack";
import { sharedLibConfig } from "../../rstack.lib.config";
import { sharedTestConfig } from "../../rstack.test.config";

define.extends([sharedLibConfig, sharedTestConfig]);

// 包级 lint 不会自动继承根配置，显式声明与根一致的规则集。
define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommended]);

define.lib({
  source: {
    entry: {
      index: ["./src/**/*.ts"],
    },
  },
});
