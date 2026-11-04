import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rustRoot = join(root, "native-rust");
const libraryNames = {
  win32: "signals_transform_native.dll",
  darwin: "libsignals_transform_native.dylib",
  linux: "libsignals_transform_native.so",
};
const library = libraryNames[process.platform];
if (!library) {
  throw new Error(`Unsupported platform: ${process.platform}`);
}

const cargo = spawnSync("cargo", ["build", "--release"], {
  cwd: rustRoot,
  stdio: "inherit",
});

if (cargo.error) {
  throw cargo.error;
}
if (cargo.status !== 0) {
  process.exit(cargo.status ?? 1);
}

const source = join(rustRoot, "target", "release", library);
const destination = join(root, "native", "index.node");
mkdirSync(join(root, "native"), { recursive: true });
copyFileSync(source, destination);
