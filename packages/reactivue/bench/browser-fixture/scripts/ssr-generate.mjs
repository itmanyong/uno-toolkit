/**
 * S6 hydration 实测：用 react-dom/server renderToString 生成服务端 HTML，
 * 注入到 fixture 构建产物 dist/index.html 中生成 dist/ssr.html（preview 服务）。
 *
 * 运行：node scripts/ssr-generate.mjs（依赖经 Node 上溯解析自 packages/reactivue/node_modules）。
 * s6 场景的元素构造需与 src/scenarios.ts 中 name === "s6" 分支保持一致。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(scriptsDir, "..");
const distDir = path.resolve(fixtureDir, "dist");

const rv = await import(
  pathToFileURLCompat(path.resolve(fixtureDir, "../../dist/index.js"))
);

function pathToFileURLCompat(p) {
  return "file:///" + p.replace(/\\/g, "/");
}

const h = React.createElement;

// 与 src/scenarios.ts 的 s6 分支保持一致
const count = rv.ref(21);
const element = h(
  "div",
  null,
  h("p", null, h(rv.TextBinding, { value: () => count.value })),
  h(rv.Block, {
    render: () =>
      h("div", {
        className: `lv-${count.value}`,
        "data-v": String(count.value),
      }, "attr"),
  }),
);

const ssr = renderToString(element);
console.log("[ssr-generate] 服务端输出:", ssr);

const indexHtml = readFileSync(path.join(distDir, "index.html"), "utf8");
const ROOT_OPEN = '<div id="root"></div>';
if (!indexHtml.includes(ROOT_OPEN)) {
  throw new Error("dist/index.html 中未找到 <div id=\"root\"></div>，rsbuild 模板可能已变化");
}
const inject = `<div id="root">${ssr}</div><script>window.__HYDRATE__=true;window.__SERVER_HTML__=${JSON.stringify(ssr)};</script>`;
const ssrHtml = indexHtml.replace(ROOT_OPEN, inject);
writeFileSync(path.join(distDir, "ssr.html"), ssrHtml, "utf8");
console.log("[ssr-generate] 已写入 dist/ssr.html");
