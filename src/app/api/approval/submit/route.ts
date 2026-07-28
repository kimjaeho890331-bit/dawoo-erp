import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canSubmit, validateApprovalLine } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

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

  // 재상신: 이전 결재 이력(comment)은 지우지 않고 결재선의 state·acted_at만 되돌린다
  const { error: linesError } = await admin
    .from('expense_report_lines')
    .update({ state: 'waiting', acted_at: null })
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
