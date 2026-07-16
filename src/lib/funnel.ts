// ============================================
// 접수 퍼널 카운팅 규칙 — 단일 소스
// 대시보드 FunnelCard와 보고서 FunnelMonthlyReport가 이 규칙을 공유한다.
// ============================================
//
// 접수대장 10단계(PROJECT_STATUSES)와의 연동:
//   문의(1) → 실측(2) → 견적전달(3) → 동의서(4) → 신청서제출(5)
//   → 승인(6) → 착공계(7) → 공사(8) → 완료서류제출(9) → 입금(10)
//
// 퍼널 4단계 매핑 (현재 상태가 해당 단계 "이상"이면 도달로 카운트):
//   콜(문의)   = 등록된 모든 건 — '문의(예약)'·'취소' 포함 (전화가 온 사실 자체가 홍보 신호)
//   실측(미팅) = 실측 이상 (실측~입금 전부) — 견적전달·동의서 단계도 실측은 이미 거쳤으므로 포함
//   신청(접수) = 신청서제출 이상
//   승인       = 승인 이상 (착공~입금 포함) — 수도는 별도 승인 없이 신청 = 승인
//
// 제외 규칙:
//   · 취소 건(cancel_reason 있음 또는 status '취소')은 콜에만 집계, 단계 도달에서 제외
//   · '문의(예약)'(시즌 외 대기)은 콜에만 집계
//
// 월 귀속(코호트): 등록월(created_at) 기준 —
//   "그 달에 들어온 문의가 지금까지 어디까지 갔나".
//   지난달 문의가 이번 달 승인되면 지난달 코호트의 승인으로 잡힌다 (전환율 분석의 표준 방식).

import { PROJECT_STATUSES, type ProjectStatus } from '@/types'

export type FunnelCategory = '소규모' | '수도'

export interface FunnelProjectRow {
  created_at: string
  status: ProjectStatus | null
  cancel_reason: string | null
  work_types: { work_categories: { name: string } | null } | null
}

export interface FunnelStat {
  calls: number    // 콜(문의) — 취소·예약 포함
  meets: number    // 실측(미팅) 도달
  intakes: number  // 신청(접수) 도달
  approved: number // 승인 도달
}

export const IDX_MEET = PROJECT_STATUSES.indexOf('실측')
export const IDX_INTAKE = PROJECT_STATUSES.indexOf('신청서제출')
export const IDX_APPROVE = PROJECT_STATUSES.indexOf('승인')

export const emptyFunnel = (): FunnelStat => ({ calls: 0, meets: 0, intakes: 0, approved: 0 })

export function funnelCategoryOf(row: FunnelProjectRow): FunnelCategory | null {
  const name = row.work_types?.work_categories?.name
  if (name === '수도') return '수도'
  if (name === '소규모') return '소규모'
  return null
}

/** 한 건을 퍼널 통계에 누적한다 (카운팅 규칙의 유일한 구현) */
export function accumulateFunnel(stat: FunnelStat, row: FunnelProjectRow): void {
  stat.calls++
  // 취소 건은 단계 도달에서 제외 — status '취소'는 PROJECT_STATUSES에 없어 idx -1로도 걸러지지만 규칙을 명시한다
  if (row.cancel_reason || row.status === ('취소' as string)) return
  const idx = row.status ? PROJECT_STATUSES.indexOf(row.status) : -1
  if (idx >= IDX_MEET) stat.meets++
  if (idx >= IDX_INTAKE) stat.intakes++
  if (idx >= IDX_APPROVE) stat.approved++
}

export const funnelPct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/** projects를 등록월 코호트(YYYY-MM)와 분류별로 집계 */
export function monthlyFunnel(rows: FunnelProjectRow[]): Map<string, Record<FunnelCategory, FunnelStat>> {
  const byMonth = new Map<string, Record<FunnelCategory, FunnelStat>>()
  for (const r of rows) {
    const cat = funnelCategoryOf(r)
    if (!cat) continue
    const ym = r.created_at.slice(0, 7)
    let m = byMonth.get(ym)
    if (!m) { m = { 소규모: emptyFunnel(), 수도: emptyFunnel() }; byMonth.set(ym, m) }
    accumulateFunnel(m[cat], r)
  }
  return byMonth
}
