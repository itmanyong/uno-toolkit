import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("../", import.meta.url));
const rustRoot = join(pkgDir, "native-rust");
const crateLib = "reactivue_native";

const TRIPLES = {
  "linux-x64-gnu": { cargo: "x86_64-unknown-linux-gnu", lib: "lib%s.so" },
  "linux-x64-musl": { cargo: "x86_64-unknown-linux-musl", lib: "lib%s.so" },
  "linux-arm64-gnu": { cargo: "aarch64-unknown-linux-gnu", lib: "lib%s.so" },
  "darwin-x64": { cargo: "x86_64-apple-darwin", lib: "lib%s.dylib" },
  "darwin-arm64": { cargo: "aarch64-apple-darwin", lib: "lib%s.dylib" },
  "win32-x64-msvc": { cargo: "x86_64-pc-windows-msvc", lib: "%s.dll" },
  "win32-arm64-msvc": { cargo: "aarch64-pc-windows-msvc", lib: "%s.dll" },
};

function inferTriple() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux" && arch === "x64") return "linux-x64-gnu";
  if (platform === "linux" && arch === "arm64") return "linux-arm64-gnu";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "win32" && arch === "x64") return "win32-x64-msvc";
  if (platform === "win32" && arch === "arm64") return "win32-arm64-msvc";
  throw new Error(`build-native: 不支持的平台 ${platform}-${arch}`);
}

const localTriple = inferTriple();
const triple = process.env.TARGET_TRIPLE || localTriple;
const cfg = TRIPLES[triple];
if (!cfg) throw new Error(`build-native: 不支持的目标三元组 "${triple}"`);

// 本机默认目标无需安装，也无需 --target；rustup 的联网检查在部分环境会长时间挂起。
const cross = triple !== localTriple;
if (cross) {
  const rustup = spawnSync("rustup", ["target", "add", cfg.cargo], {
    stdio: "inherit",
    timeout: 60_000,
  });
  if (rustup.error) throw rustup.error;
  if (rustup.status !== 0) process.exit(rustup.status ?? 1);
}

const args = ["build", "--release"];
if (cross) args.push("--target", cfg.cargo);

// musl 目标默认 crt-static（静态 libc），而 cdylib 需要动态 libc，
// 必须显式关闭 crt-static 才能构建 .so（napi-rs 官方做法）
const env = { ...process.env };
if (cfg.cargo.includes("musl")) {
  env.RUSTFLAGS = [env.RUSTFLAGS, "-C", "target-feature=-crt-static"]
    .filter(Boolean)
    .join(" ");
}

const cargo = spawnSync("cargo", args, {
  cwd: rustRoot,
  stdio: "inherit",
  timeout: 300_000,
  env,
});
if (cargo.error) throw cargo.error;
if (cargo.status !== 0) process.exit(cargo.status ?? 1);

const outputDir = cross
  ? join(rustRoot, "target", cfg.cargo, "release")
  : join(rustRoot, "target", "release");
const source = join(outputDir, cfg.lib.replace("%s", crateLib));
if (!existsSync(source)) {
  throw new Error(`build-native: 未找到编译产物 ${source}`);
}
const destination = join(pkgDir, "native", `${triple}.node`);
mkdirSync(join(pkgDir, "native"), { recursive: true });
copyFileSync(source, destination);
console.log(`✓ 已生成原生二进制: native/${triple}.node`);
