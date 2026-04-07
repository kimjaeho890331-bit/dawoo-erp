import { NextRequest, NextResponse } from 'next/server'

const CONFM_KEY = 'devU01TX0FVVEgyMDI2MDQwMzE0NDY0NDExNzg0Nzc='

export async function GET(req: NextRequest) {
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
