import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 마이그레이션(004) 미적용 시 graceful — 빈 결과 반환
function isMissing(msg?: string) {
  return !!msg && /does not exist|relation|schema cache|find the/i.test(msg)
}

// GET /api/chat/sessions?staff_id=xxx           → 세션 목록 (이어보기 레일)
// GET /api/chat/sessions?session_id=xxx         → 해당 세션 메시지 (이어보기 본문)
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const staffId = request.nextUrl.searchParams.get('staff_id')
  const sessionId = request.nextUrl.searchParams.get('session_id')

  // 세션 본문 (메시지) 로드
  if (sessionId) {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) {
      if (isMissing(error.message)) return Response.json({ messages: [], tableMissing: true })
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ messages: data || [] })
  }

  // 세션 목록
  if (!staffId) return Response.json({ error: 'staff_id 또는 session_id가 필요합니다' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('id, title, last_message_at, flagged')
    .eq('staff_id', staffId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false })
    .limit(20)
  if (error) {
    if (isMissing(error.message)) return Response.json({ sessions: [], tableMissing: true })
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ sessions: data || [] })
}

// PATCH /api/chat/sessions  body: { session_id, action: 'close' | 'flag', reason? }
//   close → status='closed' (목록에서 숨김, 소프트삭제)
//   flag  → flagged=true (👎 피드백/부정 표현)
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { session_id, action, reason } = body as { session_id?: string; action?: string; reason?: string }
  if (!session_id || !action) return Response.json({ error: 'session_id, action 필수' }, { status: 400 })

  let patch: Record<string, unknown> = {}
  if (action === 'close') patch = { status: 'closed' }
  else if (action === 'flag') patch = { flagged: true, flagged_reason: reason || '사용자 피드백' }
  else return Response.json({ error: '지원하지 않는 action' }, { status: 400 })

  const { error } = await supabaseAdmin.from('chat_sessions').update(patch).eq('id', session_id)
  if (error) {
    if (isMissing(error.message)) return Response.json({ ok: true, tableMissing: true })
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
