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

  // 승인키 미설정 방어 — 미설정 시 조용히 "결과 없음"이 되지 않도록 명확히 안내
  if (!CONFM_KEY) {
    console.error('주소 검색 실패: ADDRESS_API_KEY 환경변수가 설정되지 않았습니다')
    return NextResponse.json(
      { error: '주소 검색 서비스가 설정되지 않았습니다 (관리자: ADDRESS_API_KEY 확인). 주소를 직접 입력해주세요.', code: 'NO_KEY' },
      { status: 503 },
    )
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

    // Juso API 오류 코드를 삼키지 않고 노출 (errorCode "0" = 정상)
    // 예: E0001 "승인되지 않은 KEY 입니다" → 지금까지 "검색 결과 없음"으로 잘못 표시되던 문제
    const common = data?.results?.common
    if (common && common.errorCode && common.errorCode !== '0') {
      console.error(`Juso API 오류 [${common.errorCode}] ${common.errorMessage}`)
      const keyError = common.errorCode === 'E0001'
      return NextResponse.json(
        {
          error: keyError
            ? '주소 검색 서비스 인증 오류(승인키 미승인). 주소를 직접 입력해주세요.'
            : `주소 검색 오류: ${common.errorMessage}`,
          code: common.errorCode,
        },
        { status: keyError ? 502 : 400 },
      )
    }

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
