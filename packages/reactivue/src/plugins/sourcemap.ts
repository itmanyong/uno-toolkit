import MagicString from "magic-string";
import type { SourceEdit } from "./shared";

/**
 * 由顶层编辑区间生成 source map。
 *
 * 区间粒度映射：每个编辑区间映射到替换文本的起点，区间内部（如 JSX 块的
 * 子表达式细粒度位置）不再展开——切块变换的替换单元本身就是表达式级，
 * 这个粒度与产物结构一一对应，足够支撑断点与报错定位。
 */
export function buildSourceMap(
  code: string,
  filename: string,
  edits: SourceEdit[],
): { code: string; map: string } {
  const ms = new MagicString(code);
  for (const edit of edits) {
    if (edit.start === edit.end) {
      // 纯插入（如 import 注入）：插入到锚点之前
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
