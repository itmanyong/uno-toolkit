import { define } from "rstack";
import { sharedTestConfig } from "./rstack.test.config";

define.extends([sharedTestConfig]);

define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommended]);

define.fmt({
  // 格式化配置
});
