// 한국 주소 → 시/군 단위 지역명 추출 (접수대장 지역 카테고리 분류용)
//
// 도로명주소(Juso) API가 돌려주는 표준 주소는 항상 "시도 시군구 ..." 구조라
// 첫 두 토큰만 보면 정확히 지역을 판정할 수 있다.
//   - 광역시/특별시/특별자치시 → 그 자체가 지역   (인천광역시 → 인천, 서울특별시 → 서울, 세종특별자치시 → 세종)
//   - 도/특별자치도            → 다음 토큰의 시/군  (경기도 수원시 → 수원, 충청남도 천안시 → 천안, 경기도 가평군 → 가평)
//
// substring 매칭(주소에 '과천'이 들어있나)이 아니라 구조 기반이라
// 광역시/도 어디든 정확하고, 목록에 없는 지역도 올바른 이름을 돌려준다.
// 시도 접두어가 없는 비표준/수동 입력은 추측하지 않고 null → 오분류 대신 '미분류'.

const METRO_SUFFIXES = ['특별자치시', '특별시', '광역시'] // 그 자체가 지역
const DO_SUFFIXES = ['특별자치도', '도'] // 하위 시/군이 지역

function stripSuffix(token: string, suffixes: string[]): string | null {
  for (const s of suffixes) {
    if (token.endsWith(s) && token.length > s.length) return token.slice(0, -s.length)
  }
  return null
}

/**
 * 도로명/지번 주소에서 지역(시·군) 이름을 추출한다.
 * @returns 예) "인천", "수원", "천안", "가평" — 판정 불가 시 null
 */
export function getRegionFromAddress(road?: string | null, jibun?: string | null): string | null {
  const addr = (road || jibun || '').trim()
  if (!addr) return null

  const tokens = addr.split(/\s+/)
  if (tokens.length < 2) return null // "시도 시군구" 최소 2토큰 필요
  const sido = tokens[0]

  // 1) 광역시/특별시/특별자치시 → 자체가 지역
  const metro = stripSuffix(sido, METRO_SUFFIXES)
  if (metro) return metro

  // 2) 도/특별자치도 → 다음 토큰의 시/군
  if (DO_SUFFIXES.some((s) => sido.endsWith(s))) {
    return stripSuffix(tokens[1], ['시', '군'])
  }

  // 3) 시도 접두어 없는 비표준 입력 → 추측 금지
  return null
}
