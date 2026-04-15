import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage, type TelegramUpdate } from '@/lib/telegram/bot'
import {
  buildMorningBrief,
  buildAfternoonRemind,
  buildEveningRecap,
} from '@/lib/notifications/digest'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/telegram/webhook
// Telegram이 우리 서버로 업데이트를 push 보냄
export async function POST(req: NextRequest) {
  // 웹훅 보안 토큰 검증
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token')
    if (incomingSecret !== expectedSecret) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const update = (await req.json()) as TelegramUpdate
  const message = update.message || update.edited_message
  if (!message || !message.text) return Response.json({ ok: true })

  const chatId = message.chat.id
  const text = message.text.trim()

  try {
    // 1. /start CODE — 초대 코드로 연결
    if (text.startsWith('/start')) {
      await handleStart(chatId, text)
      return Response.json({ ok: true })
    }

    // 2. 텔레그램 연결된 staff 조회
    const { data: staff } = await supabaseAdmin
      .from('staff')
      .select('id, name')
      .eq('telegram_chat_id', String(chatId))
      .maybeSingle()

    if (!staff) {
      await sendMessage(
        chatId,
        '❌ 아직 연결되지 않은 계정입니다.\n\n관리자에게 초대 코드를 받아 `/start CODE` 형식으로 입력해주세요.',
      )
      return Response.json({ ok: true })
    }

    // 3. 슬래시 명령어 처리
    if (text.startsWith('/')) {
      await handleCommand(chatId, staff.id, text)
      return Response.json({ ok: true })
    }

    // 4. 자유 텍스트 → Claude API 프록시
    await handleFreeText(chatId, staff.id, text)
    return Response.json({ ok: true })
  } catch (e) {
    console.error('[telegram webhook] error:', e)
    return Response.json({ ok: true })  // 200 반환해야 텔레그램이 재전송 안 함
  }
}

// ============================================
// /start CODE — 초대 코드 매칭
// ============================================
async function handleStart(chatId: number, text: string) {
  const code = text.replace('/start', '').trim().toUpperCase()

  if (!code) {
    await sendMessage(
      chatId,
      `👋 *다우건설 ERP 알리미*\n\n` +
      `연결하려면 관리자가 전달한 초대 코드를 입력하세요:\n` +
      `\`/start 코드\`\n\n` +
      `예: \`/start D8F2K1\``,
    )
    return
  }

  // 이미 연결된 경우
  const { data: existing } = await supabaseAdmin
    .from('staff')
    .select('id, name')
    .eq('telegram_chat_id', String(chatId))
    .maybeSingle()
  if (existing) {
    await sendMessage(
      chatId,
      `이미 *${existing.name}*님으로 연결되어 있습니다.\n/help 입력하면 명령어 목록이 보입니다.`,
    )
    return
  }

  // 초대 코드 조회
  const { data: invite, error: invErr } = await supabaseAdmin
    .from('staff_invitations')
    .select('*')
    .eq('code', code)
    .is('used_at', null)
    .maybeSingle()

  if (invErr || !invite) {
    await sendMessage(
      chatId,
      `❌ 유효하지 않거나 이미 사용된 초대 코드입니다.\n\n관리자에게 새 코드를 요청해주세요.`,
    )
    return
  }

  // 만료 확인
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await sendMessage(chatId, `❌ 만료된 초대 코드입니다. 관리자에게 새 코드를 요청해주세요.`)
    return
  }

  // staff 매칭: 이름으로 찾기 (없으면 초대 정보로 신규 생성)
  let staffId = invite.used_by_staff_id
  let staffName = invite.name

  if (!staffId && invite.name) {
    const { data: matched } = await supabaseAdmin
      .from('staff')
      .select('id, name')
      .eq('name', invite.name)
      .maybeSingle()
    if (matched) {
      staffId = matched.id
      staffName = matched.name
    }
  }

  if (!staffId) {
    await sendMessage(
      chatId,
      `❌ 초대 코드는 유효하나 매칭되는 직원 정보가 없습니다.\n관리자에게 문의해주세요.`,
    )
    return
  }

  // 텔레그램 연결 저장
  await supabaseAdmin
    .from('staff')
    .update({
      telegram_chat_id: String(chatId),
      telegram_linked_at: new Date().toISOString(),
    })
    .eq('id', staffId)

  await supabaseAdmin
    .from('staff_invitations')
    .update({
      used_at: new Date().toISOString(),
      used_by_staff_id: staffId,
    })
    .eq('id', invite.id)

  await sendMessage(
    chatId,
    `✅ *${staffName}님 연결 완료!*\n\n` +
    `이제 ERP 알림을 여기로 받습니다.\n` +
    `/help 입력하면 명령어 목록이 보입니다.`,
  )
}

// ============================================
// 슬래시 명령 처리
// ============================================
async function handleCommand(chatId: number, staffId: string, text: string) {
  const cmd = text.split(/\s+/)[0].toLowerCase()
  const args = text.slice(cmd.length).trim()

  switch (cmd) {
    case '/help':
      await sendMessage(chatId, HELP_TEXT)
      return
    case '/오늘':
    case '/today': {
      const msg = await buildMorningBrief(staffId)
      await sendMessage(chatId, msg || '오늘 예정된 일정/업무가 없습니다.')
      return
    }
    case '/이번주':
    case '/week': {
      const msg = await buildEveningRecap(staffId)
      await sendMessage(chatId, msg || '이번 주 예정이 없습니다.')
      return
    }
    case '/브리핑':
    case '/brief': {
      const msg = await buildMorningBrief(staffId)
      await sendMessage(chatId, msg || '현재 브리핑할 항목이 없습니다.')
      return
    }
    case '/마감':
    case '/deadline': {
      const msg = await buildAfternoonRemind(staffId)
      await sendMessage(chatId, msg || '오늘 마감 항목이 없습니다.')
      return
    }
    case '/끄기':
    case '/off':
      await supabaseAdmin.from('staff').update({ notify_telegram: false }).eq('id', staffId)
      await sendMessage(chatId, '🔕 알림이 일시 중단되었습니다. `/켜기`로 재개하세요.')
      return
    case '/켜기':
    case '/on':
      await supabaseAdmin.from('staff').update({ notify_telegram: true }).eq('id', staffId)
      await sendMessage(chatId, '🔔 알림이 재개되었습니다.')
      return
    default:
      await sendMessage(chatId, `알 수 없는 명령어입니다. /help 입력하면 명령어 목록이 보입니다.`)
  }
}

// ============================================
// 자유 텍스트 → Claude API 직접 호출 (간단 응답)
// Tool use는 슬래시 명령에서 처리
// ============================================
async function handleFreeText(chatId: number, staffId: string, text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await sendMessage(chatId, '😓 AI 키가 설정되지 않았습니다.')
    return
  }

  // 1. 사용자 메시지 저장
  try {
    await supabaseAdmin.from('chat_messages').insert({
      staff_id: staffId,
      role: 'user',
      content: text,
      channel: 'telegram',
    })
  } catch { /* graceful */ }

  // 2. 최근 대화 로드 (웹 + 텔레그램 통합)
  let history: Array<{ role: string; content: string }> = []
  try {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(10)
    history = (data || []).reverse()
  } catch { /* graceful */ }

  // 3. staff 정보 + 오늘 컨텍스트 수집 (Claude에게 힌트 제공)
  const { data: staff } = await supabaseAdmin
    .from('staff').select('name, role').eq('id', staffId).maybeSingle()

  const systemPrompt = `당신은 다우건설 ERP AI 비서입니다. 텔레그램으로 대화 중입니다.
대화 상대: ${staff?.name || ''}님 (${staff?.role || ''})

## 원칙
- 간결하고 친근한 답변
- 한국어
- 한 문장이면 한 문장으로
- 모호하면 구체 질문

## 컨텍스트
- 다우건설은 경기도 15개 시 대상 정부 지원사업 접수/현장관리 회사
- 직원 6명, 텔레그램으로 자동 알림 + 양방향 AI 비서

## 할 수 있는 것
- 오늘 일정/업무 조회 → /오늘 명령 안내
- 브리핑 → /브리핑 명령 안내
- 마감 → /마감 명령 안내
- 자유 대화 → 여기서 직접 답변

※ 실제 DB 조회/등록이 필요한 요청(예: "박과장에게 업무 지시")은 "아직 슬래시 명령에서만 지원됩니다"라고 안내.
`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: history.length > 0
          ? history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          : [{ role: 'user', content: text }],
      }),
    })

    if (!res.ok) {
      await sendMessage(chatId, '😓 AI 응답 실패. 잠시 후 다시 시도해주세요.')
      return
    }
    const json = await res.json()
    const answer = json.content?.[0]?.text || '응답을 생성하지 못했습니다.'

    // 4. AI 응답 저장
    try {
      await supabaseAdmin.from('chat_messages').insert({
        staff_id: staffId,
        role: 'assistant',
        content: answer,
        channel: 'telegram',
      })
    } catch { /* graceful */ }

    // 5. 텔레그램 전송
    await sendMessage(chatId, answer)
  } catch (e) {
    console.error('[telegram freeText] Claude error:', e)
    await sendMessage(chatId, '😓 일시적 오류가 발생했습니다.')
  }
}

const HELP_TEXT = `🤖 *다우건설 ERP 알리미 명령어*

📋 *조회*
/오늘 — 오늘 일정·업무 요약
/이번주 — 이번 주 일정 미리보기
/브리핑 — AI 긴급 체크
/마감 — 오늘 마감 남은 것

⚙️ *설정*
/끄기 — 알림 일시 중단
/켜기 — 알림 재개

💬 *자유 대화*
궁금한 것을 자연어로 물어보세요.
예: "오늘 내 일정 뭐야?"
예: "신한빌라 상태 어때?"
예: "박과장한테 견적서 작성 시켜줘"

자동 알림은 매일 08:30, 15:00, 18:00에 전송됩니다.`
