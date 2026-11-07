import { define } from "rstack";
import { StyleRewriteRsbuild } from "@uno-pc/style-rewrite/rsbuild";

define.app(() => ({
  plugins: [
    StyleRewriteRsbuild({
      configs: [
        // 选择器追加：先把 vendor.css 里 `.card` 的 padding 去掉，再追加新的 padding。
        {
          pathReg: "**/src/vendor.css",
          matchReg: ".card",
          rewrite: "padding: 24px",
          rewriteType: "append",
        },
        // 选择器替换：用 rewrite 整体覆盖 `.btn` 的声明块。
        {
          pathReg: "**/src/index.css",
          matchReg: ".btn",
          rewrite:
            "background: #8ab4f8;color: #020917;border: 0;padding: 10px 16px;border-radius: 8px",
          rewriteType: "replace",
        },
        // 文本替换：pathReg 用数组同时覆盖两个文件，把旧品牌色统一换掉。
        {
          pathReg: ["**/src/vendor.css", "**/src/index.css"],
          matchReg: "#f28b82",
          rewrite: "#fdd663",
        },
        // 正则匹配：字面量找不到该写法时才按正则处理。
        {
          pathReg: "**/src/index.css",
          matchReg: "border-left:\\s*4px",
          rewrite: "border-left: 6px",
        },
        // 选择器追加：`.content` 没有 line-height，直接追加到声明块末尾。
        {
          pathReg: "**/src/**/*.css",
          matchReg: ".content",
          rewrite: "line-height: 1.6",
          rewriteType: "append",
        },
      ],
    }),
  ],
}));