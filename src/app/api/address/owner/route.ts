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

    const PER_PAGE = 100
    const fetchPage = async (page: number) => {
      const params = new URLSearchParams({ ...baseParams, numOfRows: String(PER_PAGE), pageNo: String(page) })
      const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrOwnrInfo?${params.toString()}`)
      return res.json()
    }

    const firstPage = await fetchPage(1)
    const totalCount = firstPage?.response?.body?.totalCount ?? 0
    let allItems = firstPage?.response?.body?.items?.item
    if (!allItems) return NextResponse.json([])
    allItems = Array.isArray(allItems) ? allItems : [allItems]

    // 100건 초과 시 추가 페이지
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

    const owners = allItems.map(
      (item: {
        ownrNm: string
        ownrRgstNo: string
        ownrGbCdNm: string
        ownrCpb: string
        cnrsPsnCo: number
        changDt: string
        dongNm: string
        hoNm: string
      }) => ({
        name: item.ownrNm || '',
        registNo: item.ownrRgstNo || '',
        ownerType: item.ownrGbCdNm || '',
        share: item.ownrCpb || '',
        coOwnerCount: item.cnrsPsnCo ?? 0,
        changeDate: item.changDt || '',
        dongNm: item.dongNm || '',
        hoNm: item.hoNm || '',
      }),
    )

    return NextResponse.json(owners)
  } catch (err) {
    console.error('소유자 조회 실패:', err)
    return NextResponse.json({ error: '소유자 조회에 실패했습니다' }, { status: 500 })
  }
}
