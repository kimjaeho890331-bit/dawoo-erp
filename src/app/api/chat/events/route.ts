import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED = new Set(['confirm_cancelled', 'feedback_up', 'feedback_down'])

// POST /api/chat/events  body: { kind, tool?, session_id?, staff_id?, detail? }
// 프론트 발생 신호(확인카드 취소·피드백)를 ai_events에 기록 → 'AI 검토' 대시보드 소스
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { kind, tool, session_id, staff_id, detail } = body as {
    kind?: string; tool?: string; session_id?: string; staff_id?: string; detail?: string
  }
  if (!kind || !ALLOWED.has(kind)) return Response.json({ error: '허용되지 않는 kind' }, { status: 400 })

  try {
    await supabaseAdmin.from('ai_events').insert({
      staff_id: staff_id || null, session_id: session_id || null,
      kind, tool: tool || null, detail: detail || null,
    })
  } catch { /* graceful — ai_events 미적용 시 무시 */ }
  return Response.json({ ok: true })
}
