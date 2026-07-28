import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canCancel } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canCancel(loaded.report, loaded.lines, staff.id)) {
    return Response.json(
      { error: '다음 결재자가 이미 처리했거나 완료된 문서는 취소할 수 없습니다' },
      { status: 403 },
    )
  }

  const mine = loaded.lines.find(l => l.staff_id === staff.id && l.state === 'approved')!

  const { error } = await admin.from('expense_report_lines').update({
    state: 'waiting', acted_at: null,
  }).eq('id', mine.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { error: reportError } = await admin.from('expense_reports')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  if (reportError) {
    return Response.json({ error: reportError.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
