/** 현장 지출 합. sites.spent를 쓰지 않고 expenses.site_id로만 합산한다. */
export function sumExpensesBySite(
  rows: { site_id: string | null | undefined; amount: number | null | undefined }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    if (!row.site_id) continue
    out[row.site_id] = (out[row.site_id] ?? 0) + (Number(row.amount) || 0)
  }
  return out
}
