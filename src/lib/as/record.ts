import type { AsCategory } from './target'

/** A/S 기록 한 줄. as_records 테이블과 1:1. */
export type AsStatus = '접수' | '진행중' | '완료'

export interface AsRecord {
  id: string
  project_id: string | null
  site_id: string | null
  vendor_id: string | null
  site_name: string
  address: string
  category: AsCategory
  issue_type: string
  description: string
  status: AsStatus
  reported_date: string
  resolved_date: string | null
  assigned_vendor_id: string | null
  cost: number | null
  resolution: string | null
  memo: string | null
  photos: string[]
  photos_before: string[]
  photos_after: string[]
  created_at: string
}

export const AS_STATUS_LIST: AsStatus[] = ['접수', '진행중', '완료']

export const AS_ISSUE_TYPES = ['누수', '균열', '도배불량', '타일탈락', '설비고장', '전기불량', '기타'] as const
export type AsIssueType = (typeof AS_ISSUE_TYPES)[number]

export const AS_CATEGORY_OPTIONS: { value: AsCategory; label: string }[] = [
  { value: '입찰수의계약', label: '입찰 및 수의계약' },
  { value: '수도', label: '지원사업 · 수도' },
  { value: '소규모', label: '지원사업 · 소규모' },
]

export function asCategoryLabel(category: AsCategory): string {
  return AS_CATEGORY_OPTIONS.find(o => o.value === category)?.label ?? category
}

/**
 * 사진 칸은 나중에 생겼다(034). 그 전에 들어온 줄에는 칸 자체가 없어서
 * 바로 쓰면 `undefined.map` 으로 화면이 죽는다 — 읽을 때 한 번 메워 둔다.
 */
export function normalizeAsRecord(row: Partial<AsRecord> & { id: string }): AsRecord {
  return {
    ...(row as AsRecord),
    photos: row.photos ?? [],
    photos_before: row.photos_before ?? [],
    photos_after: row.photos_after ?? [],
  }
}
