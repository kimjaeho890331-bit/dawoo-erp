import { resolveNewSiteInflow, type SiteInflowPath } from '@/lib/siteInflow'
import { resolveNewSiteWorkKind, type SiteWorkKind } from '@/lib/siteWorkKind'

export type NewSiteInflowWorkKind = {
  inflow_path: SiteInflowPath
  work_kind: SiteWorkKind
}

export type NewSiteAssertRefuse = {
  error: string
  status: 400
}

/** INSERT 전용. 빈값·null은 미확인. 허용 외 값만 거절. UPDATE에는 쓰지 않는다. */
export function newSiteInflowWorkKindRefuseReason(
  inflow_path: string | null | undefined,
  work_kind: string | null | undefined,
): string | null {
  const inflowOk = resolveNewSiteInflow(inflow_path) != null
  const workOk = resolveNewSiteWorkKind(work_kind) != null
  if (inflowOk && workOk) return null
  if (!inflowOk && !workOk) return '유입경로와 공종을 고르세요'
  if (!inflowOk) return '유입경로를 고르세요'
  return '공종을 고르세요'
}

export function assertNewSiteInflowAndWorkKind(input: {
  inflow_path?: string | null
  work_kind?: string | null
}): NewSiteInflowWorkKind | NewSiteAssertRefuse {
  const reason = newSiteInflowWorkKindRefuseReason(input.inflow_path, input.work_kind)
  if (reason) return { error: reason, status: 400 }
  return {
    inflow_path: resolveNewSiteInflow(input.inflow_path) as SiteInflowPath,
    work_kind: resolveNewSiteWorkKind(input.work_kind) as SiteWorkKind,
  }
}
