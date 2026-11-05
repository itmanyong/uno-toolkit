import { define } from "rstack";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    // 生产也输出 source map：验证 jsx-directive 的 transform map 全链路。
    output: { sourceMap: true },
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
