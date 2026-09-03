import { isSiteInflowChosen, type SiteInflowPath } from '@/lib/siteInflow'
import { isSiteWorkKindChosen, type SiteWorkKind } from '@/lib/siteWorkKind'

export type NewSiteInflowWorkKind = {
  inflow_path: SiteInflowPath
  work_kind: SiteWorkKind
}

export type NewSiteAssertRefuse = {
  error: string
  status: 400
}

/** INSERT 전용. 빈 값·null·없는 키·허용 외 값은 추정해서 채우지 않고 거절한다. UPDATE에는 쓰지 않는다. */
export function newSiteInflowWorkKindRefuseReason(
  inflow_path: string | null | undefined,
  work_kind: string | null | undefined,
): string | null {
  const inflowOk = isSiteInflowChosen(inflow_path)
  const workOk = isSiteWorkKindChosen(work_kind)
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
    inflow_path: input.inflow_path as SiteInflowPath,
    work_kind: input.work_kind as SiteWorkKind,
  }
}
