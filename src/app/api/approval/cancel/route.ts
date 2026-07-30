import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canCancel } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const { id, actor_staff_id } = (await request.json()) as { id: string; actor_staff_id?: string }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canCancel(loaded.report, loaded.lines, staff.id)) {
    return Response.json(
      { error: '다음 결재자가 이미 처리했거나 완료된 문서는 취소할 수 없습니다' },
      { status: 403 },
    )
  }

  const mine = loaded.lines.find(l => l.staff_id === staff.id && l.state === 'approved')!

  // 'approved'일 때만 갱신되도록 조건을 걸고, 실제로 갱신됐는지 확인한다 —
  // 취소 요청이 동시에 두 번 오거나 뒷사람의 처리와 겹치는 경우를 막는다.
  const { data: claimed, error } = await admin.from('expense_report_lines').update({
    state: 'waiting', acted_at: null,
  }).eq('id', mine.id).eq('state', 'approved').select('id').maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!claimed) {
    return Response.json({ error: '이미 처리된 결재입니다' }, { status: 409 })
  }

  const { error: reportError } = await admin.from('expense_reports')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  if (reportError) {
    return Response.json({ error: reportError.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
