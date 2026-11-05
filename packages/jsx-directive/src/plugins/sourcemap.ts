import MagicString from "magic-string";
import type { SourceEdit } from "../types";

/**
 * 由顶层编辑区间生成 source map（区间粒度，含 sourcesContent）。
 */
export function buildSourceMap(
  code: string,
  filename: string,
  edits: SourceEdit[],
): { code: string; map: string } {
  const ms = new MagicString(code);
  for (const edit of edits) {
    if (edit.start === edit.end) {
      ms.appendLeft(edit.start, edit.replacement);
      continue;
    }
    if (edit.end > edit.start && edit.end <= code.length) {
      ms.overwrite(edit.start, edit.end, edit.replacement);
    }
  }
  const map = ms.generateMap({
    source: filename,
    includeContent: true,
    hires: true,
  });
  // JSON 字符串形式的 map：Vite / Rsbuild 的 transform 均接受
  return { code: ms.toString(), map: map.toString() };
}
