import type { RstackConfig } from "rstack";

const isTaskDev = process.env.UNO_ORCHESTRATION_ENV === "dev";

export const sharedLibConfig: RstackConfig = {
  lib: {
    lib: [
      {
        format: "esm",
        bundle: false,
        dts: {
          tsgo: !isTaskDev,
          bundle: false,
          isolated: isTaskDev,
          distPath: "./dist/types",
        },
      },
    ],
    output: {
      target: "web",
      distPath: { root: "./dist" },
      sourceMap: true,
    },
  },
};
