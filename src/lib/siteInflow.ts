/** sites.inflow_path. 기존 행은 비워 두고 추정해서 채우지 않는다. */

export const SITE_INFLOW_PATHS = [
  '소개',
  '재계약',
  '협력사등록',
  '직접문의',
  '나라장터공고',
  '기타',
] as const

export type SiteInflowPath = (typeof SITE_INFLOW_PATHS)[number]

export function isSiteInflowPath(value: string | null | undefined): value is SiteInflowPath {
  return !!value && (SITE_INFLOW_PATHS as readonly string[]).includes(value)
}

export function isSiteInflowChosen(value: string | null | undefined): boolean {
  return isSiteInflowPath(value)
}
