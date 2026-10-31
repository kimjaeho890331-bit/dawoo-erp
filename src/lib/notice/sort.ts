/**
 * 공지사항 날짜·정렬.
 *
 * '업데이트' 글은 올린 날과 실제로 바뀐 날이 다를 수 있다. 그래서 본문 첫 줄의
 * 「업데이트 일시 : YYYY. MM. DD.」를 그 글의 날짜로 친다. notices 에 따로 칸을
 * 두지 않았으니, 글을 고쳐 이 줄을 바꾸면 목록의 날짜와 순서도 함께 바뀐다.
 * 이 줄이 없는 글은 등록일이 곧 날짜다.
 */
export type NoticeSortDir = 'asc' | 'desc'

interface DatedNotice {
  content: string
  created_at: string
}

const UPDATE_DATE_RE = /^\s*업데이트\s*일시\s*:\s*(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/

/** 목록에 보여 주고 정렬에 쓰는 날짜 (YYYY-MM-DD). */
export function noticeDate(notice: DatedNotice): string {
  const fallback = notice.created_at ? notice.created_at.slice(0, 10) : ''
  const m = notice.content.match(UPDATE_DATE_RE)
  if (!m) return fallback

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // 2월 30일처럼 없는 날짜는 Date 가 다음 달로 넘겨 버리므로, 되돌려 보아 걸러 낸다
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return fallback

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * 고정 글을 맨 위에 두고 날짜순으로 줄 세운다.
 * 날짜가 같으면 먼저 등록한 글을 오래된 쪽으로 본다.
 */
export function sortNotices<T extends DatedNotice & { pinned: boolean }>(
  notices: readonly T[],
  dir: NoticeSortDir,
): T[] {
  return [...notices].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const ascending = compare(noticeDate(a), noticeDate(b)) || compare(a.created_at, b.created_at)
    return dir === 'asc' ? ascending : -ascending
  })
}
