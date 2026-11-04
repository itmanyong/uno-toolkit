import { define } from "rstack";
import { SignalsTransformRsbuild } from "@uno-pc/signals-transform/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      pluginReact(),
      SignalsTransformRsbuild({
        mode: "auto",
        importSource: "@preact/signals-react/runtime",
        formats: ["js", "jsx", "ts", "tsx"],
      }),
    ],
    html: {
      tags: [
        {
          tag: "script",
          attrs: {
            crossOrigin: "anonymous",
            src: "//unpkg.com/react-scan/dist/auto.global.js",
          },
        },
      ],
    },
  };
});
