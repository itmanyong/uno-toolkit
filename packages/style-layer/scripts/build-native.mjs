import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("../", import.meta.url));
const pkgName = basename(pkgDir.replace(/[/\\]$/, ""));
const rustRoot = join(pkgDir, "native-rust");

// napi 平台三元组 -> { cargo 目标三元组, 产物文件名模板 (%s 替换为 crate lib 名) }
const TRIPLES = {
  "linux-x64-gnu": { cargo: "x86_64-unknown-linux-gnu", lib: "lib%s.so" },
  "linux-x64-musl": { cargo: "x86_64-unknown-linux-musl", lib: "lib%s.so" },
  "linux-arm64-gnu": { cargo: "aarch64-unknown-linux-gnu", lib: "lib%s.so" },
  "darwin-x64": { cargo: "x86_64-apple-darwin", lib: "lib%s.dylib" },
  "darwin-arm64": { cargo: "aarch64-apple-darwin", lib: "lib%s.dylib" },
  "win32-x64-msvc": { cargo: "x86_64-pc-windows-msvc", lib: "%s.dll" },
  "win32-arm64-msvc": { cargo: "aarch64-pc-windows-msvc", lib: "%s.dll" },
};

// 各包的 Rust crate [lib] name（与 native-rust/Cargo.toml 的 [lib].name 对应）
const CRATE_LIB = {
  "jsx-directive": "jsx_directive_native",
  "signals-transform": "signals_transform_native",
  "style-layer": "style_layer_native",
};

const crateLib = CRATE_LIB[pkgName];
if (!crateLib) {
  throw new Error(`build-native: 无法识别的包目录名 "${pkgName}"`);
}

function inferTriple() {
  const p = process.platform; // linux | darwin | win32
  const a = process.arch; // x64 | arm64
  if (p === "linux" && a === "x64") return "linux-x64-gnu";
  if (p === "linux" && a === "arm64") return "linux-arm64-gnu";
  if (p === "darwin" && a === "x64") return "darwin-x64";
  if (p === "darwin" && a === "arm64") return "darwin-arm64";
  if (p === "win32" && a === "x64") return "win32-x64-msvc";
  if (p === "win32" && a === "arm64") return "win32-arm64-msvc";
  throw new Error(`build-native: 不支持的平台 ${p}-${a}`);
}

const triple = process.env.TARGET_TRIPLE || inferTriple();
const cfg = TRIPLES[triple];
if (!cfg) {
  throw new Error(`build-native: 不支持的目标三元组 "${triple}"`);
}

// 安装对应的 cargo target（已安装则忽略报错）
spawnSync("rustup", ["target", "add", cfg.cargo], { stdio: "ignore" });

const cargo = spawnSync(
  "cargo",
  ["build", "--release", "--target", cfg.cargo],
  { cwd: rustRoot, stdio: "inherit" },
);
if (cargo.error) throw cargo.error;
if (cargo.status !== 0) process.exit(cargo.status ?? 1);

const libName = cfg.lib.replace("%s", crateLib);
const source = join(rustRoot, "target", cfg.cargo, "release", libName);
if (!existsSync(source)) {
  throw new Error(`build-native: 未找到编译产物 ${source}`);
}
const destination = join(pkgDir, "native", `${triple}.node`);
mkdirSync(join(pkgDir, "native"), { recursive: true });
copyFileSync(source, destination);
console.log(`✓ 已生成原生二进制: native/${triple}.node`);
