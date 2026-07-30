import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canSubmit, validateApprovalLine } from '@/lib/approval/status'

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

  const { count, error: countError } = await admin
    .from('expense_report_payments')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', id)

  if (countError) {
    return Response.json(
      { error: `지급 정보 확인 실패: ${countError.message}` },
      { status: 500 },
    )
  }

  if (!count) {
    return Response.json({ error: '지급 정보를 한 행 이상 입력해 주세요' }, { status: 400 })
  }

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

  return Response.json({ ok: true })
}
