/**
 * 与 React 文本渲染语义对齐的安全字符串化。
 * 对象值不是合法的文本绑定目标，DEV 下告警并降级为 String()。
 */
export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return "";
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.warn(
      "[reactivue] TextBinding 收到对象值，已降级为 String()；建议改用结构块。",
      value,
    );
  }
  return String(value);
}
