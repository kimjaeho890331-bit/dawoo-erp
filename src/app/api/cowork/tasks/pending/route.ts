import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Cowork 인증 */
function checkCoworkAuth(request: NextRequest): { ok: boolean; error?: string } {
  const token = process.env.COWORK_API_TOKEN
  if (!token) return { ok: false, error: 'COWORK_API_TOKEN 미설정' }
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return { ok: false, error: 'Bearer 토큰 필요' }
  if (auth.slice(7) !== token) return { ok: false, error: '토큰 불일치' }
  return { ok: true }
}

/**
 * GET /api/cowork/tasks/pending
 * Cowork가 polling하여 처리할 대기 task 목록 조회.
 * - 호출 시 status='pending'인 task들을 'processing'으로 atomically 전환 (동시성 방지)
 * - 각 task의 payload + 프로젝트 기본 정보 포함
 *
 * Query:
 *   - limit: 한번에 가져올 개수 (기본 5)
 *   - claim: 'true'면 status를 processing으로 전환 (기본 true)
 */
export async function GET(request: NextRequest) {
  const auth = checkCoworkAuth(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 })

  try {
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') || '5')
    const claim = url.searchParams.get('claim') !== 'false'

    // pending 조회
    const { data: pending, error: qErr } = await supabaseAdmin
      .from('cowork_tasks')
      .select(`
        id, project_id, task_type, payload, status, created_at,
        projects ( building_name, road_address, jibun_address, dong, ho,
                   cities ( name ),
                   work_types ( name, work_categories ( name ) ) )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 20))
    if (qErr) throw qErr
    if (!pending || pending.length === 0) return Response.json({ tasks: [] })

    // processing으로 claim
    if (claim) {
      const ids = pending.map(t => t.id)
      await supabaseAdmin
        .from('cowork_tasks')
        .update({ status: 'processing', processing_started_at: new Date().toISOString() })
        .in('id', ids)
    }

    return Response.json({ tasks: pending })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cowork Pending] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
