import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { fetchCurrentWeather } from '@/lib/weather/kma'
import { gridFromAddress } from '@/lib/weather/cityGrid'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/weather?siteId=xxx
// 또는 /api/weather?nx=60&ny=121
// 응답: { cond: "맑음", temp: "18°C", raw: "맑음 · 18°C" }
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const siteId = request.nextUrl.searchParams.get('siteId')
  const nxParam = request.nextUrl.searchParams.get('nx')
  const nyParam = request.nextUrl.searchParams.get('ny')

  let nx: number
  let ny: number

  if (nxParam && nyParam) {
    nx = parseInt(nxParam, 10)
    ny = parseInt(nyParam, 10)
  } else if (siteId) {
    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('address')
      .eq('id', siteId)
      .single()
    if (error || !data) {
      return Response.json({ error: '현장을 찾을 수 없습니다' }, { status: 404 })
    }
    const grid = gridFromAddress(data.address)
    nx = grid.nx
    ny = grid.ny
  } else {
    return Response.json({ error: 'siteId 또는 nx/ny가 필요합니다' }, { status: 400 })
  }

  const weather = await fetchCurrentWeather(nx, ny)
  if (!weather) {
    // 기상청 API 승인 전이거나 네트워크 실패 시 → UI는 수동 입력 fallback
    return Response.json({ error: '날씨 조회 실패' }, { status: 502 })
  }
  return Response.json(weather)
}
