import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage } from '@/lib/telegram/bot'
import { buildScheduleImminent } from '@/lib/notifications/digest'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/notifications/cron/imminent
// Vercel Cron: 매분 실행 (* * * * *)
// 일정이 현재 시각 +30분 안에 시작하는지 체크 후 알림
//
// ⚠️ 주의: Vercel Free 플랜은 매분 Cron 제한됨. Pro 필요.
// 대안: Supabase pg_cron 또는 10분 간격 (*/10 * * * *)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const nowISO = now.toISOString()
  const in30MinISO = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

  // 시작 시각이 현재 ~ +30분 사이인 schedules 조회
  // (schedules.start_date는 DATE 타입이라 시각 정보 없음 → 오늘 날짜 일정만 조회)
  const todayISO = now.toISOString().slice(0, 10)

  const { data: schedules } = await supabaseAdmin
    .from('schedules')
    .select('id, title, start_date, staff_id, project_id')
    .eq('start_date', todayISO)
    .neq('schedule_type', 'site')
    .not('staff_id', 'is', null)

  if (!schedules || schedules.length === 0) {
    return Response.json({ ok: true, checked: 0 })
  }

  // survey_time 등 별도 컬럼에 시간이 저장되어 있을 수 있음 — 현재 스키마에 직접 시각이 없어서
  // 이번엔 단순히 "오늘 일정이 있으면 한 번씩 알림" 정도로 구현
  // 실제 시각 연동은 프로젝트별 survey_time 조회 등 추가 작업 필요 (다음 세션)

  let sent = 0
  for (const sched of schedules) {
    // 이미 발송된 일정은 스킵
    const { data: existing } = await supabaseAdmin
      .from('notifications_log')
      .select('id')
      .eq('staff_id', sched.staff_id!)
      .eq('trigger', 'schedule_imminent')
      .eq('reference_id', sched.id)
      .maybeSingle()
    if (existing) continue

    const built = await buildScheduleImminent(sched.id)
    if (!built) continue

    // 해당 staff 조회
    const { data: staff } = await supabaseAdmin
      .from('staff')
      .select('telegram_chat_id, notify_telegram')
      .eq('id', built.staffId)
      .maybeSingle()
    if (!staff?.telegram_chat_id || !staff.notify_telegram) continue

    const result = await sendMessage(staff.telegram_chat_id, built.message)
    if (result) {
      sent++
      await supabaseAdmin.from('notifications_log').insert({
        staff_id: built.staffId,
        trigger: 'schedule_imminent',
        reference_date: todayISO,
        reference_id: sched.id,
        message_preview: built.message.slice(0, 200),
        telegram_message_id: String(result.message_id),
        success: true,
      })
    }
  }

  return Response.json({ ok: true, sent, checked: schedules.length, nowISO, in30MinISO })
}
