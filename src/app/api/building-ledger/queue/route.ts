import { NextRequest } from 'next/server'
import { admin, requireApiUser } from '@/lib/buildingLedger/admin'
import { clampQueueLimit, parseQueueStatus } from '@/lib/buildingLedger/status'

type ProjectJoin = {
  building_name: string | null
  owner_name: string | null
  owner_phone: string | null
  road_address: string | null
  jibun_address: string | null
}

/**
 * GET /api/building-ledger/queue
 * 세움터가 가져갈 대기열. status=requested(기본) 또는 issued.
 * limit 기본 5, 최대 5.
 */
export async function GET(request: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof Response) return user

  const status = parseQueueStatus(request.nextUrl.searchParams.get('status'))
  if (!status) {
    return Response.json({ error: 'status는 requested 또는 issued만 가능합니다' }, { status: 400 })
  }

  const limit = clampQueueLimit(request.nextUrl.searchParams.get('limit'))

  const { data, error } = await admin
    .from('building_ledger_requests')
    .select(`
      id, project_id, address_used, drive_folder_id, drive_folder_url, status,
      projects:project_id ( building_name, owner_name, owner_phone, road_address, jibun_address )
    `)
    .eq('status', status)
    .order('requested_at', { ascending: true })
    .limit(limit)

  if (error) {
    return Response.json({ error: `대기열 조회 실패: ${error.message}` }, { status: 500 })
  }

  const items = (data ?? []).map((row) => {
    const project = (Array.isArray(row.projects) ? row.projects[0] : row.projects) as ProjectJoin | null
    return {
      id: row.id,
      project_id: row.project_id,
      building_name: project?.building_name ?? null,
      owner_name: project?.owner_name ?? null,
      owner_phone: project?.owner_phone ?? null,
      road_address: project?.road_address ?? null,
      jibun_address: project?.jibun_address ?? null,
      address_used: row.address_used,
      drive_folder_id: row.drive_folder_id,
      drive_folder_url: row.drive_folder_url,
      status: row.status,
    }
  })

  return Response.json({ items })
}
