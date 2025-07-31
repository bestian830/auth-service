/**
 * 将空字符串或仅包含空白字符的值清洗为 null
 */
export function cleanNullableField(value?: string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}