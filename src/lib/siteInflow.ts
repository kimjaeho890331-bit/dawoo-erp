/** sites.inflow_path. 빈 INSERT는 미확인. 기존 값은 이름에서 추정하지 않는다. */

export const SITE_INFLOW_UNCONFIRMED = '미확인' as const

export const SITE_INFLOW_PATHS = [
  '소개',
  '재계약',
  '협력사등록',
  '직접문의',
  '나라장터공고',
  '기타',
  SITE_INFLOW_UNCONFIRMED,
] as const

export type SiteInflowPath = (typeof SITE_INFLOW_PATHS)[number]

export function isSiteInflowPath(value: string | null | undefined): value is SiteInflowPath {
  return !!value && (SITE_INFLOW_PATHS as readonly string[]).includes(value)
}

export function isSiteInflowChosen(value: string | null | undefined): boolean {
  return isSiteInflowPath(value)
}

/** INSERT용. 빈값·null은 미확인. 허용 외는 null. */
export function resolveNewSiteInflow(value: string | null | undefined): SiteInflowPath | null {
  if (value == null || value === '') return SITE_INFLOW_UNCONFIRMED
  return isSiteInflowPath(value) ? value : null
}
