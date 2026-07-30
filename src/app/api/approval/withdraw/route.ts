import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canWithdraw } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const { id, actor_staff_id } = (await request.json()) as { id: string; actor_staff_id?: string }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canWithdraw(loaded.report, loaded.lines, staff.id)) {
    return Response.json(
      { error: '결재자가 이미 처리한 문서는 회수할 수 없습니다' },
      { status: 403 },
    )
  }

  const { error } = await admin.from('expense_reports').update({
    status: 'withdrawn',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) {
    return Response.json({ error: `회수 실패: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
