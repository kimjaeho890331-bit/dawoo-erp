import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/chat/history?staff_id=xxx&limit=20
// 웹 + 텔레그램 통합 대화 히스토리 (최근 N개)
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const staffId = request.nextUrl.searchParams.get('staff_id')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)

  if (!staffId) {
    return Response.json({ error: 'staff_id가 필요합니다' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, role, content, channel, created_at')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // 테이블 없으면 빈 배열 반환 (graceful)
    if (/does not exist|relation/.test(error.message)) {
      return Response.json({ messages: [], tableMissing: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 오름차순 정렬 (오래된 것부터)
  const messages = (data || []).reverse()
  return Response.json({ messages })
}

// DELETE /api/chat/history?staff_id=xxx
// 대화 히스토리 전체 삭제
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const staffId = request.nextUrl.searchParams.get('staff_id')
  if (!staffId) {
    return Response.json({ error: 'staff_id가 필요합니다' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .delete()
    .eq('staff_id', staffId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
