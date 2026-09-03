import { supabase } from '@/lib/supabase'
import {
  STAFF_STORAGE_KEY,
  activityLogStaffRefuseReason,
  attachStaffNames,
  type ActivityLogRow,
  type ActivityLogWithStaff,
} from '@/lib/activityLog'

function actorStaffIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STAFF_STORAGE_KEY)?.trim() || null
}

function actorHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  const actorStaffId = actorStaffIdFromStorage()
  if (actorStaffId) headers.set('x-actor-staff-id', actorStaffId)
  return headers
}

export async function logActivity(input: {
  action: string
  target_type?: string | null
  target_id?: string | null
  detail?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actorStaffId = actorStaffIdFromStorage()
  const refused = activityLogStaffRefuseReason(actorStaffId)
  if (refused) return { ok: false, error: refused }

  try {
    const res = await fetch('/api/activity-log', {
      method: 'POST',
      credentials: 'include',
      headers: actorHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action: input.action,
        target_type: input.target_type ?? null,
        target_id: input.target_id ?? null,
        detail: input.detail ?? null,
        actor_staff_id: actorStaffId,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: body?.error || '작업 이력을 남기지 못했습니다' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '작업 이력을 남기지 못했습니다' }
  }
}

async function fetchSiteActivityLogsFromClient(siteId: string): Promise<ActivityLogWithStaff[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, staff_id, action, target_type, target_id, detail, created_at')
    .eq('target_id', siteId)
    .eq('target_type', 'site')
    .order('created_at', { ascending: false })
    .limit(80)

  if (error || !data) return []

  const rows = data as ActivityLogRow[]
  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter((id): id is string => !!id))]
  const staffById = new Map<string, string>()
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase.from('staff').select('id, name').in('id', staffIds)
    for (const s of staffRows ?? []) {
      if (s.id && s.name) staffById.set(s.id, s.name)
    }
  }
  return attachStaffNames(rows, staffById)
}

export async function fetchSiteActivityLogs(
  siteId: string,
): Promise<ActivityLogWithStaff[]> {
  try {
    const params = new URLSearchParams({ target_id: siteId, target_type: 'site' })
    const res = await fetch(`/api/activity-log?${params}`, {
      credentials: 'include',
      headers: actorHeaders(),
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { rows?: ActivityLogWithStaff[] } | null
      if (body?.rows) return body.rows
    }
  } catch { /* anon 조회로 이어서 */ }
  return fetchSiteActivityLogsFromClient(siteId)
}
