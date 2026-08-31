/** 화면용 공백 정리. 원본 데이터는 그대로 두고 표시/검색에만 쓴다. */
export function collapseDisplayWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeSearchQuery(query: string): string {
  return collapseDisplayWhitespace(query).toLowerCase()
}

/**
 * 아이디·비밀번호 글꼴.
 * ASCII-only(영문/숫자/기호)는 tabular/mono, 한글·그 외 비-ASCII 문자는 본문 sans.
 */
export function usesMonoIdFont(value: string): boolean {
  if (!value) return false
  for (const ch of value) {
    if (/\p{L}/u.test(ch) && !/[A-Za-z]/.test(ch)) return false
  }
  return true
}

export function credentialMatchesSearch(
  item: { name: string; login_id?: string | null },
  query: string,
): boolean {
  const q = normalizeSearchQuery(query)
  if (!q) return true
  const name = collapseDisplayWhitespace(item.name).toLowerCase()
  const login = collapseDisplayWhitespace(item.login_id ?? '').toLowerCase()
  return name.includes(q) || login.includes(q)
}

export function filterCredentials<T extends { name: string; login_id?: string | null }>(
  items: T[],
  query: string,
): T[] {
  const q = normalizeSearchQuery(query)
  if (!q) return items
  return items.filter((item) => credentialMatchesSearch(item, q))
}

export function hrefForCredentialUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function displayCredentialUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '')
}
