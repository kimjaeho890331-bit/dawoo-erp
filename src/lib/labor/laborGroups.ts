/**
 * 근무표 행을 공사건(현장/접수건)별로 묶는다.
 *
 * 한 달 근무표에는 여러 공사건의 인력이 섞인다. 결의서는 공사건을 문서당 하나만
 * 가지므로(expense_reports.site_id/project_id) 공사건별로 묶어 한 장씩 만든다.
 * 설계: docs/superpowers/specs/2026-10-14-labor-work-target-approval-design.md
 */

export interface LaborGroupRow {
  id: string
  site_id?: string | null
  project_id?: string | null
  sort_order?: number
  year?: number
  month?: number
}

export type LaborGroupKind = 'site' | 'project' | 'none'

export interface LaborGroup<T extends LaborGroupRow = LaborGroupRow> {
  /** `site:<id>` · `project:<id>` · `none`. 달까지 나누면 앞에 `2026-8|` 이 붙는다 */
  key: string
  kind: LaborGroupKind
  /** 공사건 id. 미지정이면 null */
  id: string | null
  /** 달까지 나눌 때만 채워진다 */
  year?: number
  month?: number
  rows: T[]
}

/** 행이 어느 공사건에 속하는지. 공사건이 없으면 `none` */
export function workTargetKey(row: LaborGroupRow): string {
  if (row.site_id) return `site:${row.site_id}`
  if (row.project_id) return `project:${row.project_id}`
  return 'none'
}

/**
 * 공사건별로 묶는다. 섹션 순서는 그 섹션 행들의 최소 sort_order, 미지정은 맨 뒤.
 *
 * @param opts.byPeriod 달까지 나눈다. 작업대에는 년/월 고르는 칸이 없어 여러 달이 섞이는데,
 *   결의서는 달 단위이고 날짜 칸(1~31)도 달마다 달라서 같은 공사건이라도 달이 다르면 따로 묶는다.
 */
export function groupLaborRows<T extends LaborGroupRow>(
  rows: T[],
  opts: { byPeriod?: boolean } = {},
): LaborGroup<T>[] {
  const groups = new Map<string, LaborGroup<T>>()
  for (const r of rows) {
    const target = workTargetKey(r)
    const key = opts.byPeriod ? `${r.year}-${r.month}|${target}` : target
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        kind: r.site_id ? 'site' : r.project_id ? 'project' : 'none',
        id: r.site_id ?? r.project_id ?? null,
        ...(opts.byPeriod ? { year: r.year, month: r.month } : {}),
        rows: [],
      }
      groups.set(key, g)
    }
    g.rows.push(r)
  }

  const minOrder = (g: LaborGroup<T>) => Math.min(...g.rows.map(r => r.sort_order ?? 0))
  return [...groups.values()].sort((a, b) => {
    if (a.kind === 'none') return 1
    if (b.kind === 'none') return -1
    return minOrder(a) - minOrder(b)
  })
}

/**
 * 결의서를 만들기 전 검사. 노무비 결의서는 공사건 연결이 없으면 저장이 막힌다
 * (026_labor_expense_work_target.sql의 CHECK). 그러니 여기서 먼저 걸러 안내한다.
 */
export function assertWorkTargetAssigned(
  rows: LaborGroupRow[],
): { ok: true } | { ok: false; error: string } {
  const missing = rows.filter(r => !r.site_id && !r.project_id).length
  if (missing > 0) {
    return { ok: false, error: `공사건이 지정되지 않은 행이 ${missing}개 있습니다. 공사건을 먼저 지정해 주세요.` }
  }
  return { ok: true }
}
