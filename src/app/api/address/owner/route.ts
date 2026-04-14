import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const CODEF_CLIENT_ID = process.env.CODEF_CLIENT_ID || ''
const CODEF_CLIENT_SECRET = process.env.CODEF_CLIENT_SECRET || ''
const CODEF_PUBLIC_KEY = process.env.CODEF_PUBLIC_KEY || ''
const CODEF_DEMO_HOST = 'https://development.codef.io'

// CODEF 토큰 캐시
let cachedToken = ''
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const credentials = Buffer.from(`${CODEF_CLIENT_ID}:${CODEF_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://oauth.codef.io/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=read',
  })
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000 // 만료 1분 전 갱신
  return cachedToken
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  if (!CODEF_CLIENT_ID) {
    return NextResponse.json({ error: 'CODEF API 키가 설정되지 않았습니다' }, { status: 500 })
  }

  const address = req.nextUrl.searchParams.get('address')
  if (!address) {
    return NextResponse.json({ error: '주소가 필요합니다' }, { status: 400 })
  }

  try {
    const token = await getToken()

    // CODEF 일반건축물대장 API 호출
    const param = {
      organization: '0001', // 정부24
      inquiryType: '0', // 일반건축물대장
      address: address,
      detailAddress: req.nextUrl.searchParams.get('detailAddress') || '',
    }

    const res = await fetch(`${CODEF_DEMO_HOST}/v1/kr/public/mw/building-register/general`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(param),
    })

    const result = await res.json()

    // CODEF 응답 파싱
    if (result.result?.code !== 'CF-00000') {
      // 데모 모드에서는 샌드박스 응답이 올 수 있음
      return NextResponse.json({
        error: result.result?.message || 'CODEF 조회 실패',
        code: result.result?.code,
        // 데모 모드면 샌드박스 데이터 반환
        demo: true,
      })
    }

    // 소유자 정보 추출
    const data = result.data
    const owners = []
    if (data?.resOwnerList) {
      for (const owner of data.resOwnerList) {
        owners.push({
          name: owner.resOwnerName || '',
          registNo: owner.resOwnerNo || '',
          ownerType: owner.resOwnerDiv || '',
          share: owner.resOwnerRatio || '',
          address: owner.resOwnerAddr || '',
        })
      }
    }

    return NextResponse.json(owners)
  } catch (err) {
    console.error('CODEF 소유자 조회 실패:', err)
    return NextResponse.json({ error: '소유자 조회에 실패했습니다' }, { status: 500 })
  }
}
