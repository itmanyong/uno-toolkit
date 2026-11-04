import type { TransformWarning } from "./types";

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
