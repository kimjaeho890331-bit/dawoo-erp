/** 기안제목 입력칸의 최대 길이. DraftForm의 slice(0, 50)과 맞춘다. */
const MAX_TITLE = 50
const SUFFIX = ' 집행 요청의 건'

/**
 * 현장·접수건 이름으로 기안제목 초안을 만든다.
 *
 * 가운데 거래처명은 기안자가 직접 끼워 넣는다 — 거래처를 나중에 바꾸면 제목이
 * 어긋나므로 자동으로 조합하지 않는다.
 */
export function draftTitleFromTarget(targetName: string): string {
  const name = targetName.trim()
  if (!name) return ''
  return (name + SUFFIX).slice(0, MAX_TITLE)
}
