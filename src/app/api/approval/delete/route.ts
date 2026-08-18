import { NextRequest } from 'next/server'
import { admin, resolveActor, loadReport } from '@/lib/approval/guard'
import { canDelete } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const { id, actor_staff_id } = (await request.json()) as { id: string; actor_staff_id?: string }

  const actor = await resolveActor(actor_staff_id)
  if (actor instanceof Response) return actor
  const { staff } = actor

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canDelete(loaded.report, staff.id)) {
    return Response.json(
      { error: '완료된 문서는 삭제할 수 없습니다' },
      { status: 403 },
    )
  }

  // 자식 행은 ON DELETE CASCADE로 함께 지워진다
  const { error } = await admin.from('expense_reports').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
