import "server-only";

/**
 * 把 `{ 列名: 值 }` 转成参数化的 `col = $1, col2 = $2`。
 *
 * 列名必须来自调用方的**内部字面量**（例如 `is_published`），绝不能来自用户输入；
 * 值一律作为参数传给 `pg`，由驱动负责转义。
 */
export function buildUpdateAssignments(
  fields: Record<string, unknown>,
  startIndex = 1,
): { assignments: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);

  return {
    assignments: entries
      .map(([column], index) => `${column} = $${startIndex + index}`)
      .join(", "),
    values: entries.map(([, value]) => value),
  };
}
