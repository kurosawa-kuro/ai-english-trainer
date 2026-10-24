/** 公開するエラーだけを明示する。例外本文・秘密値はログへ流さない。 */
class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function requireText_(value, label, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new AppError(
      "validation_error",
      label + "を正しく入力してください。",
    );
  return value.trim();
}
function requireId_(value) {
  const id = requireText_(value, "要求ID", 120);
  if (!/^[a-zA-Z0-9_-]+$/.test(id))
    throw new AppError("validation_error", "要求IDが不正です。");
  return id;
}
function stableJson_(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson_).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableJson_(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function utf8Bytes_(text) {
  return unescape(encodeURIComponent(text)).length;
}
