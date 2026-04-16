// ============================================================
//  견적서 타입 정의
// ============================================================

// 공종 키
export type WorkType = 'waterproof' | 'tile' | 'wallPaint' | 'stairPaint' | 'wallWaterRepel'

// 공종 한글 레이블
export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  waterproof: '옥상방수',
  tile: '금속기와',
  wallPaint: '외벽도장',
  stairPaint: '계단실도장',
  wallWaterRepel: '외벽발수',
}

// 공종 순서
export const WORK_TYPE_ORDER: WorkType[] = [
  'waterproof', 'tile', 'wallPaint', 'stairPaint', 'wallWaterRepel',
]

// 실측 치수
export interface Measurements {
  roofW: number    // 옥상 가로 (m)
  roofL: number    // 옥상 세로 (m)
  roofV: number    // 옥상 수직 (m)
  tileW: number    // 기와 폭 (m)
  wallW: number    // 외벽 가로 (m)
  wallL: number    // 외벽 세로 (m)
  stairW: number   // 계단 가로 (m)
  stairL: number   // 계단 세로 (m)
  buildingH: number // 건물높이 (m)
}

// 산출 면적
export interface Areas {
  roof_floor: number     // 옥상 바닥면적
  roof_vertical: number  // 옥상 수직면적
  tile: number           // 기와 면적
  wall: number           // 외벽 면적
  stair: number          // 계단실 면적
}

// 고객 정보
export interface CustomerInfo {
  buildingName: string
  roadAddress: string
  dong: number           // 동수
  unitCount: number      // 세대수
  approvalDate: string   // 사용승인일
  ownerName: string
  ownerPhone: string
  constructionDesc: string  // 공사명
  cityName: string       // 시 이름 (지원율 연동)
}

// 원가계산서 요율
export interface CostRates {
  indirectLaborRate: number   // 간접노무비율 (기본 0.15)
  adminRate: number           // 일반관리비율 (기본 0.08)
  profitRate: number          // 이윤율 (기본 0.15)
  envRate: number             // 환경보전비율 (기본 0.046)
  etcRate: number             // 기타경비율 (기본 0.052)
  subsidyRate: number         // 시 지원율 (기본 0.8)
  calcMethod: 'cost_base' | 'total_base'  // 계산 방식
}

export const DEFAULT_COST_RATES: CostRates = {
  indirectLaborRate: 0.15,
  adminRate: 0.08,
  profitRate: 0.15,
  envRate: 0.046,
  etcRate: 0.052,
  subsidyRate: 0.8,
  calcMethod: 'cost_base',
}

// 내역서 행
export interface DetailRow {
  id: string
  name: string           // 공종/품명
  spec: string           // 규격
  quantity: number        // 수량
  unit: string           // 단위 (m², EA, ...)
  materialPrice: number  // 재료비 단가
  materialAmount: number // 재료비 금액 (자동)
  laborPrice: number     // 노무비 단가
  laborAmount: number    // 노무비 금액 (자동)
  expensePrice: number   // 경비 단가
  expenseAmount: number  // 경비 금액 (자동)
  total: number          // 합계 (자동)
  memo: string
  isManual: boolean      // 수기 입력 행 여부
  isWaste: boolean       // 폐기물 처리 행 (소계 분리)
  areaRatio?: number | null  // 면적 비율 (0.3 = 30%, 1 = 100%, null = 고정수량)
}

// 원가계산서 집계 결과
export interface CostSummary {
  directMaterial: number    // 직접재료비
  directLabor: number       // 직접노무비
  directExpense: number     // 직접경비 (기계경비)
  indirectLabor: number     // 간접노무비
  // 법정경비
  nationalPension: number   // 국민연금
  healthInsurance: number   // 건강보험
  longTermCare: number      // 노인장기요양
  employmentInsurance: number // 고용보험
  industrialAccident: number // 산재보험
  retirement: number        // 퇴직공제부금
  safety: number            // 산업안전보건관리비
  envPreservation: number   // 환경보전비
  etcExpense: number        // 기타경비
  subcontractBond: number   // 하도급보증수수료
  machineLease: number      // 기계대여
  // 합계
  totalMaterial: number
  totalLabor: number
  totalExpense: number
  adminFee: number          // 일반관리비
  profit: number            // 이윤
  wasteDisposal: number     // 폐기물처리비
  supplyPrice: number       // 공급가액 (만원 절사)
  vat: number               // 부가세
  totalCost: number         // 총 공사비
  citySubsidy: number       // 시 지원금
  selfBurden: number        // 자부담
  perUnitBurden: number     // 세대당 부담
}

// 법정요율 상수 (소규모 기준)
export const STATUTORY_RATES = {
  nationalPension: 0.045,      // 국민연금 4.5%
  healthInsurance: 0.0369,     // 건강보험 3.69%
  longTermCare: 0.1295,        // 노인장기요양 12.95% (건강보험의)
  employmentInsurance: 0.009,  // 고용보험 0.9%
  industrialAccident: 0.037,   // 산재보험 3.7%
  retirement: 0.026,           // 퇴직공제 2.6%
  safety: 0.022,               // 안전관리비 2.2%
}

// 단가 마스터 (unit_prices 테이블 행)
export interface UnitPrice {
  id: string
  category: string       // '소규모', '수도', '녹색'
  year: number
  price_group: string    // 'labor', 'material', 'work_type'
  name: string
  spec: string | null
  unit: string | null
  price: number
  reference_date: string | null
  sort_order: number
}

// 견적서 전체 저장 데이터 (estimates.data JSONB)
export interface EstimateData {
  customerInfo: CustomerInfo
  checkedWorks: WorkType[]
  measurements: Measurements
  areas: Areas
  costRates: CostRates
  detailRows: Record<WorkType, DetailRow[]>
  costSummary: CostSummary
  priceYear: number
  unitPriceSnapshot: UnitPrice[]  // 생성 시점 단가 스냅샷
}

// 회사 정보 (표지용 고정)
export const COMPANY_INFO = {
  name: '(주)다우건설',
  bizNumber: '185-81-01217',
  corpNumber: '135511-0330717',
  address: '수원시 권선구 당진로 31번길 15, 3층 (당수동)',
  representative: '김지선',
  contact: '조혜진',
  businessType: '건설업',
  businessItems: '습식방수, 도장공사업, 금속창호공사업, 실내건축공사업, 기계설비공사업',
}
