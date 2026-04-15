import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage } from '@/lib/telegram/bot'
import { buildMorningBrief } from '@/lib/notifications/digest'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/notifications/cron/morning
// Vercel Cron: 매일 KST 08:30 (UTC 23:30 전날)
export async function GET(req: NextRequest) {
  // CRON_SECRET 인증 (Vercel Cron은 Authorization 헤더에 추가)
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 주말 스킵
  const now = new Date()
  const kstDay = (now.getUTCDay() + (now.getUTCHours() >= 15 ? 1 : 0)) % 7
  // 간단히: 한국 기준 토(6) / 일(0)이면 스킵
  if (kstDay === 0 || kstDay === 6) {
    return Response.json({ ok: true, skipped: 'weekend' })
  }

  const today = new Date().toISOString().slice(0, 10)

  // 알림 켜진 연결된 직원
  const { data: staffList } = await supabaseAdmin
    .from('staff')
    .select('id, name, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)
    .eq('notify_telegram', true)
    .is('resign_date', null)

  if (!staffList || staffList.length === 0) {
    return Response.json({ ok: true, sent: 0, reason: 'no active staff' })
  }

  let sent = 0
  const errors: string[] = []

  for (const staff of staffList) {
    // 중복 발송 체크
    const { data: existing } = await supabaseAdmin
      .from('notifications_log')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('trigger', 'morning_brief')
      .eq('reference_date', today)
      .maybeSingle()
    if (existing) continue

    try {
      const message = await buildMorningBrief(staff.id)
      if (!message) continue  // 내용 없으면 스킵

      const result = await sendMessage(staff.telegram_chat_id!, message)
      if (result) {
        sent++
        await supabaseAdmin.from('notifications_log').insert({
          staff_id: staff.id,
          trigger: 'morning_brief',
          reference_date: today,
          message_preview: message.slice(0, 200),
          telegram_message_id: String(result.message_id),
          success: true,
        })
      }
    } catch (e) {
      errors.push(`${staff.name}: ${String(e)}`)
    }
  }

  return Response.json({ ok: true, sent, errors })
}
