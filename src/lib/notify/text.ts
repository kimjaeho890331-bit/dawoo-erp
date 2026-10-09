/**
 * 알림 문구·요청 검사에 쓰는 작은 도구들.
 * 서버 라우트와 테스트가 함께 쓰므로 DB·네트워크에 손대지 않는다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** uuid 모양이 아니면 DB까지 가기 전에 거른다 — 그대로 넘기면 Postgres 형식 오류가 500으로 보인다. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** 'YYYY-MM-DD' → 'M/D'. 시간대 변환이 끼어들지 않게 문자열을 그대로 나눈다. */
export function shortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  return m ? `${Number(m[2])}/${Number(m[3])}` : ymd
}

/** 같은 날이면 하루만, 아니면 'M/D~M/D'. */
export function dateRange(start: string, end: string): string {
  return start === end ? shortDate(start) : `${shortDate(start)}~${shortDate(end)}`
}

/**
 * 알림 한 줄에 맞게 자른다. 줄바꿈·연속 공백은 한 칸으로 —
 * 잠금 화면 알림은 두세 줄만 보여서 긴 지시는 앞부분만 읽힌다.
 */
export function truncate(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat
}

/** 이름이 있으면 '이름: 내용', 직원 행을 못 찾았으면 내용만. */
export function withName(name: string | null | undefined, text: string): string {
  return name ? `${name}: ${text}` : text
}
