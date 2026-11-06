// 预编译 src/bench/bench.tsx -> src/bench/bench.compiled.js
// 用官方 Babel 管线（react-compiler 作为最后一个 plugin）运行 React Compiler，
// 生成纯 JS 后交由 rsbuild 正常构建。产物保留 import './driver' / 'react'。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transformSync } from "@babel/core";

const here = dirname(fileURLToPath(import.meta.url));
const input = join(here, "../src/bench/bench.tsx");
const output = join(here, "../src/bench/bench.compiled.js");

const code = readFileSync(input, "utf8");
const result = transformSync(code, {
  filename: input,
  presets: [
    ["@babel/preset-react", { runtime: "automatic" }],
    "@babel/preset-typescript",
  ],
  plugins: [["babel-plugin-react-compiler", {}]],
  configFile: false,
  babelrc: false,
  sourceMaps: false,
});

if (!result || !result.code) {
  throw new Error("babel transform failed");
}
writeFileSync(output, result.code, "utf8");

// 统计被编译器缓存化的函数个数（React Compiler 1.0 通过 `import { c as _c }` 缓存）
const cacheCount = (result.code.match(/const \$ = _c\(\d+\)/g) ?? []).length;
console.log(
  `[react-compiler] compiled ${input} -> ${output} (compiledFunctions x${cacheCount})`,
);
