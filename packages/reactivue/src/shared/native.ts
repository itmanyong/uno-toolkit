import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NativeTransformOptions,
  TransformResult,
} from "../plugins/shared";

export interface NativeBindings {
  transform(
    code: string,
    filename: string,
    options?: NativeTransformOptions,
  ): TransformResult;
}

function getPlatformTriple(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux") {
    let glibc: string | undefined;
    try {
      const report = process.report?.getReport() as
        | { header?: { glibcVersionRuntime?: string } }
        | undefined;
      glibc = report?.header?.glibcVersionRuntime;
    } catch {
      // 无法读取时按 glibc 处理。
    }
    return `linux-${arch}-${glibc ? "gnu" : "musl"}`;
  }
  if (platform === "darwin") return `darwin-${arch}-msvc`.replace("-msvc", "");
  if (platform === "win32") return `win32-${arch}-msvc`;
  throw new Error(`[reactivue] 不支持的平台: ${platform}-${arch}`);
}

let cached: NativeBindings | null = null;

/**
 * 惰性加载：仅在真正执行 transform 时才 require 原生二进制，
 * 这样只导入插件配置（alias / formats）不会因未构建 native 而失败。
 */
export function getNative(): NativeBindings {
  if (cached !== null) return cached;
  const base = dirname(fileURLToPath(import.meta.url));
  const triple = getPlatformTriple();
  const candidates = [
    resolve(base, "..", "..", "native", `${triple}.node`),
    resolve(base, "..", "..", "native", "index.node"),
  ];
  const require = createRequire(import.meta.url);
  let lastError: unknown;
  for (const file of candidates) {
    try {
      cached = require(file) as NativeBindings;
      return cached;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `[reactivue] 无法加载原生二进制（${triple}）。请先执行 \`pnpm build:native\`。\n${String(lastError)}`,
  );
}
