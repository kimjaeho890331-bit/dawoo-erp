import { admin } from '@/lib/approval/guard'
import { assertNewSiteInflowAndWorkKind } from '@/lib/assertNewSite'
import type { NewSiteInsertInput } from '@/lib/sites/types'

export type { NewSiteInsertInput }

/**
 * 신규 sites INSERT만. 빈값·null은 미확인. 허용 외 값이면 insert 하지 않는다.
 * DB NOT NULL은 건드리지 않는다. UPDATE에는 쓰지 않는다.
 */
export async function insertNewSite(
  input: NewSiteInsertInput,
): Promise<{ id: string } | { error: string; status: number }> {
  const asserted = assertNewSiteInflowAndWorkKind({
    inflow_path: input.inflow_path,
    work_kind: input.work_kind,
  })
  if ('error' in asserted) return asserted

  const name = input.name?.trim()
  if (!name) return { error: '현장명을 입력해 주세요', status: 400 }

  const { data, error } = await admin
    .from('sites')
    .insert({
      name,
      address: input.address || null,
      site_manager: input.site_manager || null,
      site_assistant: input.site_assistant || null,
      client_manager: input.client_manager || null,
      client_phone: input.client_phone || null,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      quote_date: input.quote_date || null,
      construction_start_date: input.construction_start_date || null,
      inflow_path: asserted.inflow_path,
      work_kind: asserted.work_kind,
      status: input.status || '계약',
      contract_type: input.contract_type || null,
      budget: input.budget ?? 0,
      memo: input.memo || null,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error('[sites] insert 실패:', error?.message)
    return { error: '현장을 등록하지 못했습니다', status: 500 }
  }

  return { id: data.id as string }
}
