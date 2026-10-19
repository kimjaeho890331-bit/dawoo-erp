/**
 * 건축물대장 전유부 → '전유면적 (세대별)' 묶음
 *
 * 신규등록 화면은 조회한 전유부를 면적별로 묶어 보여줬지만 저장하지는 않아,
 * 등록을 마치면 그 정보가 사라졌다. 상세화면에서도 같은 내용을 보려면
 * 묶음을 projects.extra_fields.area_groups 에 남겨야 한다.
 */

export interface AreaGroup {
  /** 전유면적 (m²) */
  area: number
  /** 그 면적을 가진 세대 수 */
  count: number
}

interface UnitLike {
  area: number
  /** '전유' / '공용' — 없으면 전유로 본다 */
  exposPubuseGbCdNm?: string
}

/** 전유부 목록을 면적별로 묶는다. 넓은 면적부터. */
export function groupUnitAreas(units: UnitLike[]): AreaGroup[] {
  const privateUnits = units.filter(u => !u.exposPubuseGbCdNm || u.exposPubuseGbCdNm === '전유')
  const counts = new Map<number, number>()
  for (const u of privateUnits) {
    const area = Number(u.area)
    if (!Number.isFinite(area) || area <= 0) continue
    counts.set(area, (counts.get(area) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.area - a.area)
}

/** extra_fields 에 저장된 묶음을 읽는다. 모양이 깨져 있으면 빈 배열. */
export function readAreaGroups(extraFields: unknown): AreaGroup[] {
  if (!extraFields || typeof extraFields !== 'object') return []
  const raw = (extraFields as Record<string, unknown>).area_groups
  if (!Array.isArray(raw)) return []
  return raw
    .map(g => {
      if (!g || typeof g !== 'object') return null
      const area = Number((g as Record<string, unknown>).area)
      const count = Number((g as Record<string, unknown>).count)
      if (!Number.isFinite(area) || !Number.isFinite(count)) return null
      return { area, count }
    })
    .filter((g): g is AreaGroup => g !== null)
}

/** 묶음 합계 세대수 (세대수 칸이 비었을 때 보조로 쓴다) */
export function totalUnitsOf(groups: AreaGroup[]): number {
  return groups.reduce((sum, g) => sum + g.count, 0)
}
