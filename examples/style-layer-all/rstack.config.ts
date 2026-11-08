import { define } from "rstack";
import { StyleLayerPluginRsbuild } from "@uno-pc/style-layer/rsbuild";

define.app(() => ({
  plugins: [
    StyleLayerPluginRsbuild({
      configs: [
        { include: "**/src/vendor.css", layerName: "vendor" },
        { include: "**/src/**/*.css", layerName: "application" },
      ],
      skipIfLayerExists: true,
      importLayer: true,
    }),
  ],
}));
