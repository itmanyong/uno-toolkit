import { define } from "rstack";
import { sharedLibConfig } from "../../rstack.lib.config";
import { sharedTestConfig } from "../../rstack.test.config";

define.extends([sharedLibConfig, sharedTestConfig]);

define.lib({
  source: {
    entry: {
      index: ["./src/**/*.ts"],
    },
  },
});
