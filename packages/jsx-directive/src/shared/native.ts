import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NativeBindings } from "../types";

const nativePath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "native",
    "index.node",
  ),
).href;
const { default: runtime } = (await import(nativePath, {
  with: { type: "addon" },
})) as { default: NativeBindings };

export const native: NativeBindings = runtime;
