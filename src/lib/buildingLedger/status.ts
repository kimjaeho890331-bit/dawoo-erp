export const BUILDING_LEDGER_STATUSES = ['requested', 'issued', 'confirmed'] as const

export type BuildingLedgerStatus = (typeof BUILDING_LEDGER_STATUSES)[number]

export const OPEN_LEDGER_STATUSES: readonly BuildingLedgerStatus[] = ['requested', 'issued']

export const QUEUE_LIMIT_DEFAULT = 5
export const QUEUE_LIMIT_MAX = 5

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function isOpenLedgerStatus(status: string): boolean {
  return status === 'requested' || status === 'issued'
}

/** 신청·발급 중이면 같은 빌라를 다시 넣을 수 없다. 확인 후에는 다시 신청 가능. */
export function canQueueProject(existingStatuses: readonly string[]): boolean {
  return !existingStatuses.some(isOpenLedgerStatus)
}

export function canTransition(
  from: string,
  to: BuildingLedgerStatus,
): boolean {
  if (from === 'requested' && to === 'issued') return true
  if (from === 'issued' && to === 'confirmed') return true
  return false
}

export function canCancelRequest(status: string): boolean {
  return status === 'requested'
}

export function snapshotAddress(project: {
  road_address?: string | null
  jibun_address?: string | null
}): string | null {
  const road = project.road_address?.trim()
  if (road) return road
  const jibun = project.jibun_address?.trim()
  if (jibun) return jibun
  return null
}

export function displayAddress(
  road?: string | null,
  jibun?: string | null,
): { text: string; missing: boolean } {
  const snap = snapshotAddress({ road_address: road, jibun_address: jibun })
  if (snap) return { text: snap, missing: false }
  return { text: '주소 없음', missing: true }
}

export function clampQueueLimit(raw: string | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return QUEUE_LIMIT_DEFAULT
  return Math.min(QUEUE_LIMIT_MAX, Math.floor(n))
}

export function parseQueueStatus(
  raw: string | null | undefined,
): 'requested' | 'issued' | null {
  const s = raw ?? 'requested'
  if (s === 'requested' || s === 'issued') return s
  return null
}

export interface IssueItemInput {
  id: string
  drive_folder_id?: string
  drive_folder_url?: string
  drive_file_id?: string
  drive_file_url?: string
  note?: string
}

const DRIVE_KEYS = [
  'drive_folder_id',
  'drive_folder_url',
  'drive_file_id',
  'drive_file_url',
  'note',
] as const

/** 호출자가 보낸 드라이브 필드만 넣는다. URL을 만들지 않는다. */
export function buildIssueUpdate(
  item: Omit<IssueItemInput, 'id'>,
  now: string,
  batchKey?: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: 'issued',
    issued_at: now,
    updated_at: now,
  }
  if (batchKey !== undefined) patch.batch_key = batchKey
  for (const key of DRIVE_KEYS) {
    if (item[key] !== undefined) patch[key] = item[key]
  }
  return patch
}

export function buildConfirmUpdate(
  staffId: string | null | undefined,
  now: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: 'confirmed',
    confirmed_at: now,
    updated_at: now,
  }
  if (staffId && isUuid(staffId)) patch.confirmed_by = staffId
  return patch
}

export function mergeIssueIds(
  ids: unknown,
  items: unknown,
): { ok: true; items: IssueItemInput[] } | { ok: false; error: string } {
  const byId = new Map<string, IssueItemInput>()

  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'items 형식이 올바르지 않습니다' }
      }
      const row = raw as Record<string, unknown>
      if (typeof row.id !== 'string' || !isUuid(row.id)) {
        return { ok: false, error: '유효하지 않은 요청 id입니다' }
      }
      const item: IssueItemInput = { id: row.id }
      for (const key of DRIVE_KEYS) {
        if (row[key] === undefined) continue
        if (row[key] !== null && typeof row[key] !== 'string') {
          return { ok: false, error: `${key}는 문자열이어야 합니다` }
        }
        item[key] = row[key] as string
      }
      byId.set(row.id, item)
    }
  }

  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (typeof id !== 'string' || !isUuid(id)) {
        return { ok: false, error: '유효하지 않은 요청 id입니다' }
      }
      if (!byId.has(id)) byId.set(id, { id })
    }
  }

  if (byId.size === 0) {
    return { ok: false, error: '발급할 요청 id가 필요합니다' }
  }

  return { ok: true, items: Array.from(byId.values()) }
}

export function sanitizeSearchQuery(raw: string): string {
  return raw.replace(/[%_,()]/g, '').trim()
}
