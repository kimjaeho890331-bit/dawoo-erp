import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canCancel } from '@/lib/approval/status'
import { sendPush } from '@/lib/push/send'

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

  // 취소로 문서가 mine의 차례로 되돌아간다. "다음 결재자"는 currentTurnLine이
  // 아니라(그건 다시 mine 자신을 가리킨다) mine 다음 순번에서 대기 중이던 사람 —
  // 취소 이전 스냅샷(loaded.lines) 기준으로 찾는다.
  const nextLine = loaded.lines
    .filter(l => l.seq > mine.seq && l.state === 'waiting')
    .sort((a, b) => a.seq - b.seq)[0]

  const recipients = [loaded.report.drafter_staff_id]
  if (nextLine) recipients.push(nextLine.staff_id)

  await sendPush(recipients, {
    title: '결재 취소됨',
    body: loaded.report.title,
    url: `/approval/${id}`,
    tag: `approval-${id}`,
  })

  return Response.json({ ok: true })
}
