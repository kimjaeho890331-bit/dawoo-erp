import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const CONFM_KEY = process.env.ADDRESS_API_KEY!

export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const keyword = req.nextUrl.searchParams.get('keyword')
  if (!keyword) {
    return NextResponse.json({ error: '검색어를 입력하세요' }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      confmKey: CONFM_KEY,
      keyword,
      resultType: 'json',
      countPerPage: '10',
      currentPage: '1',
    })

    const res = await fetch(
      `https://business.juso.go.kr/addrlink/addrLinkApi.do?${params.toString()}`,
    )
    const data = await res.json()

    const jusoList = data?.results?.juso || []

    const results = jusoList.map(
      (item: {
        roadAddr: string
        jibunAddr: string
        bdNm: string
        admCd: string
        lnbrMnnm: string
        lnbrSlno: string
      }) => ({
        roadAddr: item.roadAddr,
        jibunAddr: item.jibunAddr,
        bdNm: item.bdNm,
        admCd: item.admCd,
        lnbrMnnm: item.lnbrMnnm,
        lnbrSlno: item.lnbrSlno,
        sigunguCd: item.admCd.substring(0, 5),
        bjdongCd: item.admCd.substring(5, 10),
      }),
    )

    return NextResponse.json(results)
  } catch (err) {
    console.error('주소 검색 실패:', err)
    return NextResponse.json({ error: '주소 검색에 실패했습니다' }, { status: 500 })
  }
}
