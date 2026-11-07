import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NativeBindings } from "../types";

/**
 * 根据当前运行环境推导 napi 平台三元组，例如：
 *   linux-x64-gnu / linux-x64-musl / linux-arm64-gnu
 *   darwin-x64 / darwin-arm64
 *   win32-x64-msvc / win32-arm64-msvc
 */
function getPlatformTriple(): string {
  const platform = process.platform; // linux | darwin | win32
  const arch = process.arch; // x64 | arm64
  if (platform === "linux") {
    let glibc: string | undefined;
    try {
      const report = process.report?.getReport() as
        | { header?: { glibcVersionRuntime?: string } }
        | undefined;
      glibc = report?.header?.glibcVersionRuntime;
    } catch {
      // process.report 不可用时按 glibc 处理
    }
    const libc = glibc ? "gnu" : "musl";
    return `linux-${arch}-${libc}`;
  }
  if (platform === "darwin") return `darwin-${arch}`;
  if (platform === "win32") return `win32-${arch}-msvc`;
  throw new Error(`不支持的平台: ${platform}-${arch}`);
}

function loadBindings(): NativeBindings {
  const base = dirname(fileURLToPath(import.meta.url));
  const triple = getPlatformTriple();
  const candidates = [
    resolve(base, "..", "..", "native", `${triple}.node`),
    resolve(base, "..", "..", "native", "index.node"), // 兼容旧版单文件产物
  ];
  const require = createRequire(import.meta.url);
  let lastError: unknown;
  for (const file of candidates) {
    try {
      return require(file) as NativeBindings;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `无法加载原生二进制（目标三元组 ${triple}）。请先执行 \`pnpm build:native\` 构建对应平台的产物。\n原始错误: ${String(lastError)}`,
  );
}

export const native: NativeBindings = loadBindings();
