/**
 * 현장관리 정식 이름은 그대로 두고, 내 현장 카드 제목만 짧게 보여 준다.
 * DB에 새 이름을 쓰지 않는다.
 */
export function shortSiteName(name: string | null | undefined): string {
  const raw = (name ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''

  const school =
    raw.match(/([가-힣A-Za-z0-9]+학교)/)?.[1] ||
    raw.match(/([가-힣A-Za-z0-9]+여고)/)?.[1] ||
    raw.match(/([가-힣A-Za-z0-9]+중학교)/)?.[1] ||
    raw.match(/([가-힣A-Za-z0-9]+고등학교)/)?.[1] ||
    raw.match(/([가-힣A-Za-z0-9]+초)(?=\s|$)/)?.[1]
  if (school) {
    return school.replace(/중학교$/, '중').replace(/고등학교$/, '고')
  }

  const dong = raw.match(/([가-힣]+)\d*동/)
  if (dong) return dong[1]

  const pump = raw.match(/([가-힣A-Za-z0-9]+)펌프장/)
  if (pump) return pump[1]

  const inst = raw.match(/([가-힣A-Za-z0-9]+(?:의회|박물관|지점))/)
  if (inst) return inst[1]

  const cleaned = raw
    .replace(/^\d{4}년\s*/, '')
    .replace(/\s*(교체공사|설치공사|개선공사|보수공사|설비공사|방수공사|공사)$/, '')
    .trim()
  return cleaned.split(/\s+/)[0] || raw
}
