import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const SERVICE_KEY = process.env.BUILDING_API_KEY!

export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const sigunguCd = req.nextUrl.searchParams.get('sigunguCd')
  const bjdongCd = req.nextUrl.searchParams.get('bjdongCd')
  const bun = req.nextUrl.searchParams.get('bun')
  const ji = req.nextUrl.searchParams.get('ji')

  if (!sigunguCd || !bjdongCd || !bun || !ji) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      sigunguCd,
      bjdongCd,
      bun: bun.padStart(4, '0'),
      ji: ji.padStart(4, '0'),
      numOfRows: '100',
      pageNo: '1',
      _type: 'json',
    })

    const res = await fetch(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${params.toString()}`,
    )
    const data = await res.json()

    const items = data?.response?.body?.items?.item
    if (!items) {
      return NextResponse.json([])
    }

    const list = Array.isArray(items) ? items : [items]

    // exposPubuseGbCd === "1" 은 전유부만 필터
    const units = list
      .filter(
        (item: { exposPubuseGbCd: string }) => item.exposPubuseGbCd === '1',
      )
      .map(
        (item: {
          hoNm: string
          flrNo: number
          area: number
          exposPubuseGbCdNm: string
          dongNm: string
        }) => ({
          dongNm: item.dongNm || '',
          hoNm: item.hoNm || '',
          flrNo: item.flrNo ?? 0,
          area: item.area ?? 0,
          exposPubuseGbCdNm: item.exposPubuseGbCdNm || '',
        }),
      )

    return NextResponse.json(units)
  } catch (err) {
    console.error('전유부 조회 실패:', err)
    return NextResponse.json({ error: '전유부 조회에 실패했습니다' }, { status: 500 })
  }
}
