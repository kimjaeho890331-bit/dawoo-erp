/** sites.work_kind. 빈 INSERT는 미확인. 기존 값은 이름에서 추정하지 않는다. */

export const SITE_WORK_KIND_UNCONFIRMED = '미확인' as const

export const SITE_WORK_KINDS = [
  '기계가스설비',
  '실내건축',
  '습식방수',
  '금속창호',
  '도장',
  SITE_WORK_KIND_UNCONFIRMED,
] as const

export type SiteWorkKind = (typeof SITE_WORK_KINDS)[number]

export function isSiteWorkKind(value: string | null | undefined): value is SiteWorkKind {
  return !!value && (SITE_WORK_KINDS as readonly string[]).includes(value)
}

export function isSiteWorkKindChosen(value: string | null | undefined): boolean {
  return isSiteWorkKind(value)
}

/** INSERT용. 빈값·null은 미확인. 허용 외는 null. */
export function resolveNewSiteWorkKind(value: string | null | undefined): SiteWorkKind | null {
  if (value == null || value === '') return SITE_WORK_KIND_UNCONFIRMED
  return isSiteWorkKind(value) ? value : null
}
