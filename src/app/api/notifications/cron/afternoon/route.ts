import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage } from '@/lib/telegram/bot'
import { buildAfternoonRemind } from '@/lib/notifications/digest'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/notifications/cron/afternoon
// Vercel Cron: 매일 KST 15:00 (UTC 06:00)
// 조건부: 오늘 마감 남은 것 있을 때만 발송
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const kstDay = (now.getUTCDay() + (now.getUTCHours() >= 15 ? 1 : 0)) % 7
  if (kstDay === 0 || kstDay === 6) {
    return Response.json({ ok: true, skipped: 'weekend' })
  }

  const today = new Date().toISOString().slice(0, 10)

  const { data: staffList } = await supabaseAdmin
    .from('staff')
    .select('id, name, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)
    .eq('notify_telegram', true)
    .is('resign_date', null)

  if (!staffList) return Response.json({ ok: true, sent: 0 })

  let sent = 0
  let skipped = 0

  for (const staff of staffList) {
    const { data: existing } = await supabaseAdmin
      .from('notifications_log')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('trigger', 'afternoon_remind')
      .eq('reference_date', today)
      .maybeSingle()
    if (existing) { skipped++; continue }

    const message = await buildAfternoonRemind(staff.id)
    if (!message) { skipped++; continue }  // 빈 내용이면 스킵

    const result = await sendMessage(staff.telegram_chat_id!, message)
    if (result) {
      sent++
      await supabaseAdmin.from('notifications_log').insert({
        staff_id: staff.id,
        trigger: 'afternoon_remind',
        reference_date: today,
        message_preview: message.slice(0, 200),
        telegram_message_id: String(result.message_id),
        success: true,
      })
    }
  }

  return Response.json({ ok: true, sent, skipped })
}
