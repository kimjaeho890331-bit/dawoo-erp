import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canSubmit, currentTurnLine, validateApprovalLine } from '@/lib/approval/status'
import { sendPush } from '@/lib/push/send'
import { formatMoney } from '@/lib/utils/format'

export async function POST(request: NextRequest) {
  const { id, actor_staff_id } = (await request.json()) as { id: string; actor_staff_id?: string }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canSubmit(loaded.report, staff.id)) {
    return Response.json({ error: '상신할 수 없는 문서입니다' }, { status: 403 })
  }

  const lineErr = validateApprovalLine(loaded.lines, staff.id)
  if (lineErr) return Response.json({ error: lineErr }, { status: 400 })

  // 지급 정보는 상신을 막지 않는다. 계좌·거래처가 아직 안 나온 상태에서도 결재를
  // 먼저 올려야 하는 실무가 있어서, 예전에 여기서 하던 필수값 검사를 걷어냈다.
  // 빈 값으로 승인되면 그만큼 비어 있는 expenses가 생기므로, 채우는 책임은 결재자에게 있다.
  // (지급요청일만은 expense_report_payments.pay_request_date가 DATE NOT NULL이라
  //  DB가 저장 단계에서 이미 막는다 — 여기서 다시 볼 필요가 없다.)

  // 재상신: state만 되돌리고 acted_at·comment는 남긴다
  // → 결재자가 자기가 왜 반려했는지(누가, 언제, 무슨 의견) 다시 볼 수 있어야 한다
  const { error: linesError } = await admin
    .from('expense_report_lines')
    .update({ state: 'waiting' })
    .eq('report_id', id)

  if (linesError) {
    return Response.json(
      { error: `결재선 초기화 실패: ${linesError.message}` },
      { status: 500 },
    )
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'pending',
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) {
    return Response.json({ error: `상신 실패: ${error.message}` }, { status: 500 })
  }

  // 방금 모든 행을 'waiting'으로 되돌렸으므로, 그 상태 그대로 1차 결재자를 구한다.
  // 알림 실패는 상신 자체를 실패시키지 않는다(sendPush는 예외를 던지지 않는다).
  const turn = currentTurnLine(loaded.lines.map(l => ({ ...l, state: 'waiting' as const })))
  if (turn) {
    await sendPush([turn.staff_id], {
      title: '결재 요청',
      body: `${loaded.report.title} / ${formatMoney(loaded.report.total_amount)}원`,
      url: `/approval/${id}`,
      tag: `approval-${id}`,
    })
  }

  return Response.json({ ok: true })
}
