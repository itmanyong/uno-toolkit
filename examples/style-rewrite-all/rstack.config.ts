import { define } from "rstack";
import { StyleRewritePluginRsbuild } from "@uno-pc/style-rewrite/rsbuild";

define.app(() => ({
  plugins: [
    StyleRewritePluginRsbuild({
      configs: [
        // 选择器追加：先把 vendor.css 里 `.card` 的 padding 去掉，再追加新的 padding。
        {
          matchPathReg: "**/src/vendor.css",
          rewriteMatchReg: ".card",
          rewriteContent: "padding: 24px",
          rewriteType: "append",
        },
        // 选择器替换：用 rewriteContent 整体覆盖 `.btn` 的声明块。
        {
          matchPathReg: "**/src/index.css",
          rewriteMatchReg: ".btn",
          rewriteContent:
            "background: #8ab4f8;color: #020917;border: 0;padding: 10px 16px;border-radius: 8px",
          rewriteType: "replace",
        },
        // 文本替换：matchPathReg 用数组同时覆盖两个文件，把旧品牌色统一换掉。
        {
          matchPathReg: ["**/src/vendor.css", "**/src/index.css"],
          rewriteMatchReg: "#f28b82",
          rewriteContent: "#fdd663",
        },
        // 正则匹配：字面量找不到该写法时才按正则处理。
        {
          matchPathReg: "**/src/index.css",
          rewriteMatchReg: "border-left:\\s*4px",
          rewriteContent: "border-left: 6px",
        },
        // 选择器追加：`.content` 没有 line-height，直接追加到声明块末尾。
        {
          matchPathReg: "**/src/**/*.css",
          rewriteMatchReg: ".content",
          rewriteContent: "line-height: 1.6",
          rewriteType: "append",
        },
      ],
    }),
  ],
}));
