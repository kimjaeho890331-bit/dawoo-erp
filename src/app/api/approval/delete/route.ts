import { NextRequest } from 'next/server'
import { admin, requireStaff, loadReport } from '@/lib/approval/guard'
import { canDelete } from '@/lib/approval/status'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (staff instanceof Response) return staff

  const { id } = (await request.json()) as { id: string }

  const loaded = await loadReport(id)
  if (!loaded) return Response.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 })

  if (!canDelete(loaded.report, staff.id)) {
    return Response.json(
      { error: '저장된·회수된·반려된 문서만 삭제할 수 있습니다' },
      { status: 403 },
    )
  }

  // 자식 행은 ON DELETE CASCADE로 함께 지워진다
  const { error } = await admin.from('expense_reports').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
