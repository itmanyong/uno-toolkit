import type { TransformWarning } from "../types";

export interface TransformWarningWithLocation extends TransformWarning {
  id: string;
  loc: {
    line: number;
    column: number;
  };
}

export type WarningReporter = (warning: TransformWarningWithLocation) => void;

const positionAt = (
  source: string,
  offset: number,
): { line: number; column: number } => {
  // native 输出的偏移已统一为 UTF-16 code unit（与 JS 字符串索引一致）
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines.at(-1)!.length,
  };
};

export const reportWarnings = (
  warnings: TransformWarning[],
  id: string,
  source: string,
  warn: WarningReporter,
): void => {
  for (const diagnostic of warnings) {
    warn({
      ...diagnostic,
      id,
      loc: positionAt(source, diagnostic.start),
    });
  }
};

/** 编译期阻断错误，必须在编译期 throw 而非降级为告警。 */
export const throwOnErrors = (
  errors: TransformWarning[] | undefined,
  id: string,
  source: string,
): void => {
  if (!errors?.length) return;
  const messages: string[] = [];
  reportWarnings(errors, id, source, (diagnostic) => {
    messages.push(
      `${diagnostic.id}:${diagnostic.loc.line}:${diagnostic.loc.column + 1}: ${diagnostic.message}`,
    );
  });
  throw new Error(messages.join("\n"));
};
