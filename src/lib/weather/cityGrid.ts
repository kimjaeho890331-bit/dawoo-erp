// ============================================
// 기상청 격자 좌표 (nx, ny) — 15개 시
// ============================================
// 기상청 단기예보 API는 위경도 대신 LCC 격자좌표 사용
// 출처: 기상청 공식 "동네예보 지점좌표" (경기도 주요 시)
// https://www.data.go.kr/data/15084084/openapi.do

export interface CityGrid {
  name: string
  nx: number
  ny: number
}

// 15개 시 격자 좌표
const CITY_GRID: CityGrid[] = [
  { name: '수원', nx: 60, ny: 121 },
  { name: '성남', nx: 63, ny: 124 },
  { name: '안양', nx: 59, ny: 123 },
  { name: '부천', nx: 57, ny: 125 },
  { name: '광명', nx: 58, ny: 125 },
  { name: '시흥', nx: 57, ny: 123 },
  { name: '안산', nx: 58, ny: 121 },
  { name: '군포', nx: 59, ny: 122 },
  { name: '의왕', nx: 60, ny: 122 },
  { name: '과천', nx: 60, ny: 124 },
  { name: '용인', nx: 64, ny: 119 },
  { name: '화성', nx: 57, ny: 119 },
  { name: '오산', nx: 62, ny: 118 },
  { name: '평택', nx: 62, ny: 114 },
  { name: '하남', nx: 63, ny: 126 },
]

// 폴백 좌표 (수원 본사)
export const DEFAULT_GRID: CityGrid = CITY_GRID[0]

/**
 * 주소 문자열에서 시를 찾아 격자좌표 반환
 * 예: "경기도 수원시 영통구 매산로 100" → { nx: 60, ny: 121 }
 * 매칭 실패 시 수원 폴백
 */
export function gridFromAddress(address: string | null | undefined): CityGrid {
  if (!address) return DEFAULT_GRID
  for (const g of CITY_GRID) {
    if (address.includes(g.name)) return g
  }
  return DEFAULT_GRID
}
