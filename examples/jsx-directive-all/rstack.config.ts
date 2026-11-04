import { define } from "rstack";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      JsxDirectiveRsbuild({
        prefix: "v-",
        formats: ["jsx", "tsx"],
        ifFallback: "null",
        show: {
          property: "display",
          whenTrue: "undefined",
          whenFalse: "'none'",
        },
      }),
      pluginReact({
        reactCompiler: true,
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
