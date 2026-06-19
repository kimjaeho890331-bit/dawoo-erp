import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const TOOL_LABEL: Record<string, string> = {
  register_project: '접수 등록', update_project: '접수 수정', update_status: '단계 변경',
  manage_schedule: '일정', manage_expense: '지출 등록', record_deposit: '입금 기록',
  manage_memory: '기억 저장',
}

// GET /api/ai-review → 지표 + 검토 큐 + 학습 규칙
export async function GET() {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  // 1) ai_events 집계 (최근 1000건을 JS에서 집계 — 직원 5명 규모라 충분)
  let events: { kind: string; tool: string | null; session_id: string | null; created_at: string }[] = []
  try {
    const { data } = await supabaseAdmin
      .from('ai_events')
      .select('kind, tool, session_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    events = data || []
  } catch { /* graceful */ }

  const count = (k: string) => events.filter(e => e.kind === k).length
  const approved = count('confirm_approved')
  const cancelled = count('confirm_cancelled')
  const shown = count('confirm_shown')
  const up = count('feedback_up')
  const down = count('feedback_down')
  const approveRate = approved + cancelled > 0 ? Math.round((approved / (approved + cancelled)) * 100) : null

  // 도구별 등록/취소
  const toolMap: Record<string, { approved: number; cancelled: number }> = {}
  events.forEach(e => {
    if (!e.tool) return
    if (e.kind !== 'confirm_approved' && e.kind !== 'confirm_cancelled') return
    if (!toolMap[e.tool]) toolMap[e.tool] = { approved: 0, cancelled: 0 }
    if (e.kind === 'confirm_approved') toolMap[e.tool].approved++
    else toolMap[e.tool].cancelled++
  })
  const byTool = Object.entries(toolMap)
    .map(([tool, v]) => ({ tool, label: TOOL_LABEL[tool] || tool, ...v, total: v.approved + v.cancelled }))
    .sort((a, b) => b.total - a.total)

  // 최근 취소 (AI가 헛다리 짚은 후보)
  const recentCancels = events
    .filter(e => e.kind === 'confirm_cancelled')
    .slice(0, 20)
    .map(e => ({ tool: e.tool, label: TOOL_LABEL[e.tool || ''] || e.tool, session_id: e.session_id, created_at: e.created_at }))

  // 2) 플래그된 대화 (👎 / 부정표현)
  let flaggedSessions: { id: string; title: string | null; last_message_at: string; flagged_reason: string | null }[] = []
  let flaggedCount = 0
  let totalSessions = 0
  try {
    const { data: flagged } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, title, last_message_at, flagged_reason')
      .eq('flagged', true).neq('status', 'closed')
      .order('last_message_at', { ascending: false }).limit(20)
    flaggedSessions = flagged || []
    const { count: fc } = await supabaseAdmin.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('flagged', true)
    flaggedCount = fc || 0
    const { count: tc } = await supabaseAdmin.from('chat_sessions').select('id', { count: 'exact', head: true })
    totalSessions = tc || 0
  } catch { /* graceful */ }

  // 3) 학습 규칙 (ai_memory)
  let rules: { id: string; category: string; key: string; value: string; created_at: string }[] = []
  try {
    const { data } = await supabaseAdmin
      .from('ai_memory')
      .select('id, category, key, value, created_at')
      .order('created_at', { ascending: false }).limit(100)
    rules = data || []
  } catch { /* graceful */ }

  return Response.json({
    metrics: { approved, cancelled, shown, approveRate, up, down, flaggedCount, totalSessions },
    byTool,
    reviewQueue: { flaggedSessions, recentCancels },
    rules,
  })
}

// POST /api/ai-review  body: { key, value, category? } → 학습 규칙 저장(ai_memory upsert)
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { key, value, category } = body as { key?: string; value?: string; category?: string }
  if (!key || !value) return Response.json({ error: 'key, value 필수' }, { status: 400 })
  const cat = category || 'rule'

  try {
    const { data: existing } = await supabaseAdmin.from('ai_memory').select('id').eq('key', key).limit(1).maybeSingle()
    if (existing) {
      await supabaseAdmin.from('ai_memory').update({ value, category: cat }).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('ai_memory').insert({ category: cat, key, value, source: 'review' })
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '저장 실패' }, { status: 500 })
  }
  return Response.json({ ok: true })
}

// DELETE /api/ai-review?id=xxx → 학습 규칙 삭제
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })
  try {
    await supabaseAdmin.from('ai_memory').delete().eq('id', id)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '삭제 실패' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
