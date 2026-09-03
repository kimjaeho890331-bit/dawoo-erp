/** 신규 접수 region. 기존 행은 채우지 않는다. 주소에서 추측해 넣지 않는다. */

export function regionNameFromCityId(
  cityId: string | null | undefined,
  cities: { id: string; name: string }[],
): string | null {
  const name = cities.find(c => c.id === cityId)?.name?.trim()
  return name || null
}

export function projectCreateRegionRefuseReason(
  region: string | null | undefined,
): string | null {
  if (!region?.trim()) return '지역을 선택해 주세요'
  return null
}
