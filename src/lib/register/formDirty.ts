/**
 * 신규·수정 창에 사람이 입력한 것이 있는지.
 * 창을 열 때 채워진 값(신규는 기본 담당자 등, 수정은 기존 값)과 비교한다 —
 * 기본값만 있는 빈 창을 닫을 때까지 "저장 안 됨"을 묻지 않도록.
 * 앞뒤 공백만 다른 것은 입력으로 보지 않는다.
 */
export function hasUnsavedInput(
  current: Record<string, string>,
  baseline: Record<string, string>,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)])
  for (const key of keys) {
    if ((current[key] ?? '').trim() !== (baseline[key] ?? '').trim()) return true
  }
  return false
}
