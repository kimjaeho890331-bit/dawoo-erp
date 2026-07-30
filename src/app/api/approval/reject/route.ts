import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canApprove, currentTurnLine } from '@/lib/approval/status'
import { sendPush } from '@/lib/push/send'

export async function POST(request: NextRequest) {
  const { id, comment, actor_staff_id } = (await request.json()) as {
    id: string; comment?: string; actor_staff_id?: string
  }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff, authEmail } = actor

  if (!comment?.trim()) {
    return Response.json({ error: '반려 사유를 입력해 주세요' }, { status: 400 })
  }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canApprove(loaded.report, loaded.lines, staff.id)) {
    return Response.json({ error: '지금 결재할 차례가 아닙니다' }, { status: 403 })
  }

  const turn = currentTurnLine(loaded.lines)!
  const now = new Date().toISOString()

  // 승인과 마찬가지로 아직 'waiting'일 때만 갱신되도록 조건을 걸고, 실제로
  // 갱신됐는지 확인한다 — 승인과 반려가 동시에 도착하는 경우도 여기서 막힌다.
  const { data: claimed, error: lineError } = await admin.from('expense_report_lines').update({
    state: 'rejected', acted_at: now, comment, acted_by_email: authEmail,
  }).eq('id', turn.id).eq('state', 'waiting').select('id').maybeSingle()

  if (lineError) {
    return Response.json({ error: `반려 처리 실패: ${lineError.message}` }, { status: 500 })
  }
  if (!claimed) {
    return Response.json({ error: '이미 처리된 결재입니다' }, { status: 409 })
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'rejected', updated_at: now,
  }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await sendPush([loaded.report.drafter_staff_id], {
    title: '결재 반려',
    body: `${loaded.report.title} — ${comment}`,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })

  return Response.json({ ok: true })
}
