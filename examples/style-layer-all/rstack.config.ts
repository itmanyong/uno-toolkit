import { define } from "rstack";
import { StyleLayerRsbuild } from "@uno-pc/style-layer/rsbuild";

define.app(() => ({
  plugins: [
    StyleLayerRsbuild({
      configs: [
        { include: "**/src/vendor.css", layerName: "vendor" },
        { include: "**/src/**/*.css", layerName: "application" },
      ],
      skipIfLayerExists: true,
      importLayer: true,
    }),
  ],
}));
