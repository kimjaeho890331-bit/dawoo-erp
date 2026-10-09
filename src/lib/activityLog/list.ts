import { admin } from '@/lib/approval/guard'
import { attachStaffNames, type ActivityLogRow, type ActivityLogWithStaff } from '@/lib/activityLog'

// 서버에서 읽으므로 서비스 키(admin)로 읽는다. 예전에는 로그인 정보 없는 anon 키로 읽어,
// DB에 '로그인한 사람만'(RLS)을 켜면 작업 이력이 비었다. 호출하는 /api/activity-log가 로그인을 확인한다.
function reader() {
  return admin
}

export async function listActivityLogs(params: {
  targetId?: string | null
  targetType?: string | null
  limit?: number
}): Promise<{ rows: ActivityLogWithStaff[] } | { error: string; status: number }> {
  const db = reader()
  let q = db
    .from('activity_log')
    .select('id, staff_id, action, target_type, target_id, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 80)

  if (params.targetId) q = q.eq('target_id', params.targetId)
  if (params.targetType) q = q.eq('target_type', params.targetType)

  const { data, error } = await q
  if (error) {
    console.error('[activity_log] list 실패:', error.message)
    return { error: '작업 이력을 불러오지 못했습니다', status: 500 }
  }

  const rows = (data ?? []) as ActivityLogRow[]
  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter((id): id is string => !!id))]

  const staffById = new Map<string, string>()
  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await db
      .from('staff')
      .select('id, name')
      .in('id', staffIds)
    if (staffError) {
      console.error('[activity_log] staff 조인 실패:', staffError.message)
      return { error: '작업 이력을 불러오지 못했습니다', status: 500 }
    }
    for (const s of staffRows ?? []) {
      if (s.id && s.name) staffById.set(s.id, s.name)
    }
  }

  return { rows: attachStaffNames(rows, staffById) }
}
