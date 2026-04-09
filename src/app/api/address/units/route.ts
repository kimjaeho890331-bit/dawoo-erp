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
    const baseParams = {
      serviceKey: SERVICE_KEY,
      sigunguCd,
      bjdongCd,
      bun: bun.padStart(4, '0'),
      ji: ji.padStart(4, '0'),
      _type: 'json',
    }

    // 공공데이터 API는 numOfRows 최대 100건 제한 → 페이징 필수
    const PER_PAGE = 100
    const fetchPage = async (page: number) => {
      const params = new URLSearchParams({ ...baseParams, numOfRows: String(PER_PAGE), pageNo: String(page) })
      const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${params.toString()}`)
      return res.json()
    }

    const firstPage = await fetchPage(1)
    const totalCount = firstPage?.response?.body?.totalCount ?? 0
    let allItems = firstPage?.response?.body?.items?.item
    if (!allItems) return NextResponse.json([])
    allItems = Array.isArray(allItems) ? allItems : [allItems]

    // 100건 초과 시 추가 페이지 가져오기
    if (totalCount > PER_PAGE) {
      const totalPages = Math.ceil(totalCount / PER_PAGE)
      const promises = []
      for (let p = 2; p <= totalPages; p++) {
        promises.push(fetchPage(p))
      }
      const results = await Promise.all(promises)
      for (const more of results) {
        const moreItems = more?.response?.body?.items?.item
        if (moreItems) {
          const arr = Array.isArray(moreItems) ? moreItems : [moreItems]
          allItems = [...allItems, ...arr]
        }
      }
    }

    // exposPubuseGbCd === "1" 은 전유부만 필터
    const units = allItems
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
