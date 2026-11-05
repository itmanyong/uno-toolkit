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
  const before = Buffer.from(source).subarray(0, offset).toString();
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

/** R-A：残留 v-memo 属于正确性错误，必须在编译期阻断而非降级为告警。 */
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
