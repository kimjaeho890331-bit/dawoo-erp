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
      numOfRows: '10',
      pageNo: '1',
      _type: 'json',
    })

    const res = await fetch(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params.toString()}`,
    )
    const data = await res.json()

    const items = data?.response?.body?.items?.item
    if (!items) {
      return NextResponse.json(null)
    }

    const item = Array.isArray(items) ? items[0] : items

    return NextResponse.json({
      bldNm: item.bldNm || '',
      mainPurpsCdNm: item.mainPurpsCdNm || '',
      etcPurps: item.etcPurps || '',
      hhldCnt: item.hhldCnt ?? 0,
      useAprDay: item.useAprDay || '',
      strctCdNm: item.strctCdNm || '',
      grndFlrCnt: item.grndFlrCnt ?? 0,
      ugrndFlrCnt: item.ugrndFlrCnt ?? 0,
      totArea: item.totArea ?? 0,
    })
  } catch (err) {
    console.error('건축물대장 조회 실패:', err)
    return NextResponse.json({ error: '건축물대장 조회에 실패했습니다' }, { status: 500 })
  }
}
