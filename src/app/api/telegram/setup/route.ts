import { NextRequest } from 'next/server'
import { setWebhook, getMe } from '@/lib/telegram/bot'

// GET /api/telegram/setup — 봇 정보 확인
export async function GET() {
  const me = await getMe()
  if (!me) {
    return Response.json({
      error: 'TELEGRAM_BOT_TOKEN 미설정 또는 잘못된 토큰',
    }, { status: 500 })
  }
  return Response.json({
    bot: me,
    next_step: 'POST로 호출하면 웹훅이 등록됩니다.',
  })
}

// POST /api/telegram/setup — 웹훅 URL 등록
// 한 번만 호출하면 됨 (배포 후 1회)
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin
  const webhookUrl = `${origin}/api/telegram/webhook`
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET

  const ok = await setWebhook(webhookUrl, secret)
  if (!ok) {
    return Response.json({ error: '웹훅 등록 실패' }, { status: 500 })
  }
  return Response.json({
    ok: true,
    webhook_url: webhookUrl,
    message: '웹훅 등록 완료. 이제 봇에 메시지 보내면 이 서버가 수신합니다.',
  })
}
