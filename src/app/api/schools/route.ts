import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const NEIS_KEY = process.env.NEIS_API_KEY!
const ATPT_CODE = 'J10' // 경기도 교육청
const TARGET_CITIES = ['수원', '화성', '안양']

interface SchoolInfo {
  name: string
  type: string // 초등학교, 중학교, 고등학교
  address: string
  city: string
  dong: string
}

function extractDong(address: string): string {
  // 도로명주소에서 동 추출: "경기도 수원시 장안구 수일로 135" → 동 없음
  // 지번주소에서 동 추출 시도
  const match = address.match(/([가-힣]+[동읍면리])\s/)
  return match ? match[1] : '기타'
}

function extractCity(address: string): string {
  for (const city of TARGET_CITIES) {
    if (address.includes(city)) return city
  }
  return ''
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    // 경기도 전체 학교 3페이지 로드
    const allSchools: SchoolInfo[] = []
    for (let p = 1; p <= 3; p++) {
      const params = new URLSearchParams({
        KEY: NEIS_KEY, Type: 'json', pIndex: String(p), pSize: '1000',
        ATPT_OFCDC_SC_CODE: ATPT_CODE,
      })
      const res = await fetch(`https://open.neis.go.kr/hub/schoolInfo?${params}`)
      const data = await res.json()
      const items = data?.schoolInfo?.[1]?.row || []

      for (const item of items) {
        const address = item.ORG_RDNMA || ''
        const city = extractCity(address)
        if (!city) continue

        const type = item.SCHUL_KND_SC_NM || ''
        if (!['초등학교', '중학교', '고등학교'].includes(type)) continue

        allSchools.push({
          name: item.SCHUL_NM,
          type,
          address,
          city,
          dong: extractDong(address),
        })
      }
    }

    return NextResponse.json(allSchools)
  } catch (err) {
    console.error('학교 정보 조회 실패:', err)
    return NextResponse.json({ error: '학교 정보 조회에 실패했습니다' }, { status: 500 })
  }
}
