// 节点 ID 生成。方案要求：ID 全项目唯一且稳定；名称不承担身份。
// 使用 UUID v4（WebView2 的 crypto.randomUUID 在安全上下文可用；fallback 到 RFC4122 手写）
export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // fallback
  const b = (n: number): string => Math.floor(Math.random() * Math.pow(2, n * 8)).toString(16).padStart(n * 2, '0');
  return `${b(4)}-${b(2)}-${b(2)}-${b(2)}-${b(6)}`;
}

// 节点 ID 校验：非空字符串。唯一性由 validateDocument 的重复检测兜底。
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}
