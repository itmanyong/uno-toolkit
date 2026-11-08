import { define } from "rstack";
import { JsxDirectivePluginRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    // 生产也输出 source map：验证 jsx-directive 的 transform map 全链路。
    output: { sourceMap: true },
    plugins: [
      JsxDirectivePluginRsbuild({
        prefix: "x-",
        formats: ["jsx", "tsx"],
        vIf: {
          notFallback: "null",
        },
        vShow: {
          property: "display",
          whenTrueValue: "undefined",
          whenFalseValue: "'none'",
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
