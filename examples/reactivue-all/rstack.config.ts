import { define } from "rstack";
import { ReactivueRsbuild } from "@uno-pc/reactivue/rsbuild";
import { JsxDirectiveRsbuild } from "@uno-pc/jsx-directive/rsbuild";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  return {
    plugins: [
      pluginReact(),
      // R-A 契约：reactivue 先注册，先消费 v-memo；
      // jsx-directive 后注册，遇到残留 v-memo 会在编译期报错。
      ReactivueRsbuild({ formats: ["tsx", "jsx"] }),
      JsxDirectiveRsbuild(),
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
