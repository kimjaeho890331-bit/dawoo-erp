import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/ai/brief?staff_id=xxx → 팝업 히어로용 오늘 브리핑(개인화 인사 + 핵심 숫자 3개)
// 미수금은 신호로 띄우지 않음(독촉 금지 규칙) — 진행/일정 위주의 중립 정보만.
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const staffId = request.nextUrl.searchParams.get('staff_id')
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.toISOString().slice(0, 7)}-01`

  let name = ''
  if (staffId) {
    try {
      const { data } = await supabaseAdmin.from('staff').select('name').eq('id', staffId).single()
      name = data?.name || ''
    } catch { /* graceful */ }
  }

  let ongoingIntake = 0
  let todaySchedules = 0
  let monthIntake = 0
  try {
    const [totalP, doneP, todayS, monthP] = await Promise.all([
      supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }).in('status', ['취소', '입금']),
      supabaseAdmin.from('schedules').select('id', { count: 'exact', head: true }).eq('start_date', today).neq('schedule_type', 'site'),
      supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    ])
    ongoingIntake = Math.max(0, (totalP.count || 0) - (doneP.count || 0))
    todaySchedules = todayS.count || 0
    monthIntake = monthP.count || 0
  } catch { /* graceful */ }

  return Response.json({ name, today, stats: { ongoingIntake, todaySchedules, monthIntake } })
}
