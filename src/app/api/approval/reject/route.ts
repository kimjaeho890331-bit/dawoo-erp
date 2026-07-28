import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canApprove, currentTurnLine } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id, comment } = (await request.json()) as { id: string; comment?: string }

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

  const { error: lineError } = await admin.from('expense_report_lines').update({
    state: 'rejected', acted_at: now, comment,
  }).eq('id', turn.id)

  if (lineError) {
    return Response.json({ error: `반려 처리 실패: ${lineError.message}` }, { status: 500 })
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'rejected', updated_at: now,
  }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
