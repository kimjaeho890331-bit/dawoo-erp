import { createClient } from '@supabase/supabase-js'
import { attachStaffNames, type ActivityLogRow, type ActivityLogWithStaff } from '@/lib/activityLog'

function reader() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
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
