// ============================================
// 기상청 초단기실황 API 클라이언트
// ============================================
// 엔드포인트: getUltraSrtNcst (현재 시각 실황)
// 단기예보(getVilageFcst)가 아닌 실황을 쓰는 이유:
//  - 현장일지는 "지금 날씨"가 필요 (예보 아님)
//  - 실황이 더 정확하고 항목이 단순 (T1H, PTY, SKY 등)

const ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst'

// 하늘상태 코드 (SKY) — 동네예보와 호환
// 초단기실황에는 SKY가 없으므로 PTY만으로 날씨 결정 + 강수 없으면 "맑음"으로 간주
const PTY_MAP: Record<string, string> = {
  '0': '',       // 강수 없음
  '1': '비',
  '2': '비/눈',
  '3': '눈',
  '5': '빗방울',
  '6': '빗방울눈날림',
  '7': '눈날림',
}

export interface WeatherResult {
  cond: string   // "맑음" / "비" / "눈" 등
  temp: string   // "18°C"
  raw: string    // "맑음 · 18°C"
}

/**
 * 현재 시각 기준 base_date, base_time 계산
 * 초단기실황은 매 정시에 발표, 약 40분 후 제공
 * 예: 10:50 현재 → base_time=1000 (10시 발표)
 *     10:30 현재 → base_time=0900 (9시 발표, 10시는 아직 미발표)
 */
function getBaseDateTime(): { base_date: string; base_time: string } {
  const now = new Date()
  // 40분 이전이면 이전 시각 데이터 사용
  if (now.getMinutes() < 40) {
    now.setHours(now.getHours() - 1)
  }
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${hh}00` }
}

interface KmaItem {
  baseDate: string
  baseTime: string
  category: string  // T1H(기온), PTY(강수형태), REH(습도), RN1(강수량), WSD(풍속) 등
  nx: number
  ny: number
  obsrValue: string
}

interface KmaResponse {
  response?: {
    header?: { resultCode: string; resultMsg: string }
    body?: {
      items?: { item: KmaItem[] }
    }
  }
}

/**
 * 기상청 초단기실황 조회
 * 실패 시 null 반환 (UI에서 수동 입력 허용)
 */
export async function fetchCurrentWeather(nx: number, ny: number): Promise<WeatherResult | null> {
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) return null

  const { base_date, base_time } = getBaseDateTime()
  const params = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: '10',
    pageNo: '1',
    dataType: 'JSON',
    base_date,
    base_time,
    nx: String(nx),
    ny: String(ny),
  })

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as KmaResponse
    const items = json.response?.body?.items?.item ?? []
    if (items.length === 0) return null

    // 카테고리별 값 추출
    const valueMap: Record<string, string> = {}
    for (const it of items) {
      valueMap[it.category] = it.obsrValue
    }

    // 기온
    const t1h = valueMap['T1H']
    const tempStr = t1h ? `${Math.round(parseFloat(t1h))}°C` : ''

    // 날씨 상태 — 강수형태 기반
    const pty = valueMap['PTY'] ?? '0'
    let cond = PTY_MAP[pty] || ''
    if (!cond) {
      // 강수 없음 → "맑음"으로 표시
      cond = '맑음'
    }

    return {
      cond,
      temp: tempStr,
      raw: tempStr ? `${cond} · ${tempStr}` : cond,
    }
  } catch {
    return null
  }
}
