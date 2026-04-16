// ============================================================
//  견적서 순수 계산 함수
//  엑셀 수식을 그대로 재현 (TRUNC, ROUNDDOWN 등)
// ============================================================

import type {
  Measurements,
  Areas,
  CostRates,
  CostSummary,
  DetailRow,
  WorkType,
  STATUTORY_RATES as _SR,
} from './estimateTypes'
import { STATUTORY_RATES } from './estimateTypes'

// ── 기본 수학 ──

/** 소수점 절사 (엑셀 TRUNC) — 반올림 아님 */
export function trunc(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals)
  return Math.trunc(value * factor) / factor
}

/** 만원 단위 절사 (엑셀 ROUNDDOWN(val, -4)) */
export function roundDownTo10000(value: number): number {
  return Math.floor(value / 10000) * 10000
}

/** 천단위 콤마 포맷 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-'
  return Math.round(n).toLocaleString('ko-KR')
}

/** 퍼센트 포맷 (0.15 → "15%") */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`
}

// ── 면적 산출 ──

/** 실측 치수 → 면적 자동계산 (엑셀 수량산출서 수식 재현) */
export function calcAreas(m: Measurements): Areas {
  // 옥상 바닥면적 = 가로 × 세로
  const roof_floor = trunc(m.roofW * m.roofL, 1)

  // 옥상 수직면적 = (가로 + 세로) × 2 × 수직높이
  const roof_vertical = trunc((m.roofW + m.roofL) * 2 * m.roofV, 1)

  // 기와 면적 = (가로 + 기와폭마진) × (세로 + 기와폭마진)
  // 엑셀 수식: 가로×세로 + 둘레×기와폭 (근사)
  const tile = trunc(m.roofW * m.roofL + (m.roofW + m.roofL) * 2 * m.tileW, 1)

  // 외벽 면적 = (가로 + 세로) × 2 × 건물높이
  const wall = trunc((m.wallW + m.wallL) * 2 * m.buildingH, 1)

  // 계단실 면적 = (가로 × 세로) × 4 + (가로 + 세로) × 2 × 건물높이
  // 엑셀: 바닥면적×4면 + 둘레×건물높이
  const stair = trunc(
    (m.stairW * m.stairL) * 4 + (m.stairW + m.stairL) * 2 * m.buildingH,
    1,
  )

  return { roof_floor, roof_vertical, tile, wall, stair }
}

// ── 내역서 행 계산 ──

/** 내역서 한 행의 금액 계산 */
export function calcDetailRow(row: DetailRow): DetailRow {
  const materialAmount = trunc(row.quantity * row.materialPrice)
  const laborAmount = trunc(row.quantity * row.laborPrice)
  const expenseAmount = trunc(row.quantity * row.expensePrice)
  const total = trunc(materialAmount + laborAmount + expenseAmount)

  return {
    ...row,
    materialAmount,
    laborAmount,
    expenseAmount,
    total,
  }
}

/** 내역서 전체 행의 소계 (폐기물 제외) */
export function calcDetailSubtotal(rows: DetailRow[]) {
  const nonWaste = rows.filter(r => !r.isWaste)
  return {
    material: nonWaste.reduce((s, r) => s + r.materialAmount, 0),
    labor: nonWaste.reduce((s, r) => s + r.laborAmount, 0),
    expense: nonWaste.reduce((s, r) => s + r.expenseAmount, 0),
    total: nonWaste.reduce((s, r) => s + r.total, 0),
  }
}

/** 내역서 폐기물 합계 */
export function calcWasteTotal(rows: DetailRow[]): number {
  return rows.filter(r => r.isWaste).reduce((s, r) => s + r.total, 0)
}

// ── 원가계산서 ──

/** 전체 원가계산서 계산
 *  detailRows: 공종별 내역서 행들
 *  checkedWorks: 체크된 공종
 *  rates: 요율 (인라인 수정 가능)
 *  unitCount: 세대수
 */
export function calcCostSummary(
  detailRows: Record<WorkType, DetailRow[]>,
  checkedWorks: WorkType[],
  rates: CostRates,
  unitCount: number,
): CostSummary {
  // 1. 공종별 집계 → 합산
  let directMaterial = 0
  let directLabor = 0
  let directExpense = 0
  let wasteDisposal = 0

  for (const wt of checkedWorks) {
    const rows = detailRows[wt] || []
    const sub = calcDetailSubtotal(rows)
    directMaterial += sub.material
    directLabor += sub.labor
    directExpense += sub.expense
    wasteDisposal += calcWasteTotal(rows)
  }

  // 2. 간접노무비
  const indirectLabor = trunc(directLabor * rates.indirectLaborRate)

  // 3. 총 노무비
  const totalLabor = directLabor + indirectLabor

  // 4. 법정경비 (노무비 기준)
  const nationalPension = trunc(totalLabor * STATUTORY_RATES.nationalPension)
  const healthInsurance = trunc(totalLabor * STATUTORY_RATES.healthInsurance)
  const longTermCare = trunc(healthInsurance * STATUTORY_RATES.longTermCare)
  const employmentInsurance = trunc(totalLabor * STATUTORY_RATES.employmentInsurance)
  const industrialAccident = trunc(totalLabor * STATUTORY_RATES.industrialAccident)
  const retirement = trunc(totalLabor * STATUTORY_RATES.retirement)

  // 5. 안전관리비 (재료+노무 기준)
  const safety = trunc((directMaterial + totalLabor) * STATUTORY_RATES.safety)

  // 6. 환경보전비 (재료+노무 기준)
  const envPreservation = trunc((directMaterial + totalLabor) * rates.envRate)

  // 7. 기타경비 (노무+경비 기준)
  const baseExpense = directExpense + nationalPension + healthInsurance +
    longTermCare + employmentInsurance + industrialAccident + retirement + safety
  const etcExpense = trunc((totalLabor + baseExpense) * rates.etcRate)

  // 8. 하도급보증·기계대여 (현재 0, 필요 시 추가)
  const subcontractBond = 0
  const machineLease = 0

  // 9. 총 경비
  const totalExpense = directExpense + nationalPension + healthInsurance +
    longTermCare + employmentInsurance + industrialAccident + retirement +
    safety + envPreservation + etcExpense + subcontractBond + machineLease

  // 10. 총 재료비
  const totalMaterial = directMaterial

  // 11. 일반관리비 (재료+노무+경비)
  const adminFee = trunc((totalMaterial + totalLabor + totalExpense) * rates.adminRate)

  // 12. 이윤 (노무+경비+관리비)
  const profit = trunc((totalLabor + totalExpense + adminFee) * rates.profitRate)

  // 13. 공급가액 → 총 공사비
  const rawSupply = totalMaterial + totalLabor + totalExpense + adminFee + profit + wasteDisposal
  let supplyPrice: number
  let vat: number
  let totalCost: number

  if (rates.calcMethod === 'cost_base') {
    // 공사원가/80%: 공급가 먼저 만원 절사 → 부가세 별도
    supplyPrice = roundDownTo10000(rawSupply)
    vat = trunc(supplyPrice * 0.1)
    totalCost = supplyPrice + vat
  } else {
    // 총공사비/80%: (공급가+부가세) 합산 후 만원 절사
    totalCost = roundDownTo10000(rawSupply * 1.1)
    vat = trunc(totalCost / 11)
    supplyPrice = totalCost - vat
  }

  // 14. 시 지원·자부담
  const citySubsidy = trunc(totalCost * rates.subsidyRate)
  const selfBurden = totalCost - citySubsidy
  const perUnitBurden = unitCount > 0 ? trunc(selfBurden / unitCount) : 0

  return {
    directMaterial,
    directLabor,
    directExpense,
    indirectLabor,
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    industrialAccident,
    retirement,
    safety,
    envPreservation,
    etcExpense,
    subcontractBond,
    machineLease,
    totalMaterial,
    totalLabor,
    totalExpense,
    adminFee,
    profit,
    wasteDisposal,
    supplyPrice,
    vat,
    totalCost,
    citySubsidy,
    selfBurden,
    perUnitBurden,
  }
}

// ── 공종별 면적 매핑 ──

/** 공종 → 어떤 면적을 수량으로 쓰는지 */
export function getAreaForWorkType(wt: WorkType, areas: Areas): number {
  switch (wt) {
    case 'waterproof':
      return areas.roof_floor + areas.roof_vertical
    case 'tile':
      return areas.tile
    case 'wallPaint':
    case 'wallWaterRepel':
      return areas.wall
    case 'stairPaint':
      return areas.stair
  }
}
