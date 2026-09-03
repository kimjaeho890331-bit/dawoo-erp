/** sites.work_kind. 기존 행은 비워 두고 추정해서 채우지 않는다. */

export const SITE_WORK_KINDS = [
  '기계가스설비',
  '실내건축',
  '습식방수',
  '금속창호',
  '도장',
] as const

export type SiteWorkKind = (typeof SITE_WORK_KINDS)[number]

export function isSiteWorkKind(value: string | null | undefined): value is SiteWorkKind {
  return !!value && (SITE_WORK_KINDS as readonly string[]).includes(value)
}

export function isSiteWorkKindChosen(value: string | null | undefined): boolean {
  return isSiteWorkKind(value)
}
