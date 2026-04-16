// ============================================================
//  견적서 엑셀 데이터 (2026 소규모 견적서 공사원가/80% 기준)
//  Source: Z:\■ 견적서 양식\2026 소규모 견적서 (공사원가／80% 기준).xlsx
//  기준: 2025년 07월
// ============================================================

import type { WorkType } from './estimateTypes'

// ── 노임단가 (2025년 07월 기준) ──
export const LABOR_PRICES = [
  { name: '방수공', unit: '인', price: 220722, reference: '2025-07' },
  { name: '코킹공', unit: '인', price: 206732, reference: '2025-07' },
  { name: '보통인부', unit: '인', price: 169804, reference: '2025-07' },
  { name: '도장공', unit: '인', price: 253409, reference: '2025-07' },
  { name: '지붕잇기공', unit: '인', price: 224113, reference: '2025-07' },
  { name: '건축목공', unit: '인', price: 277894, reference: '2025-07' },
]

// ── 재료단가 (2025년 07월 기준) ──
export const MATERIAL_PRICES = [
  { category: '방수', name: '크린탄 1000', spec: '우레탄 하도제', unit: '14L', price: 105875, reference: '2025-07', page: '471' },
  { category: '방수', name: '크린탄 2100', spec: '우레탄 중도제', unit: '20Kg', price: 124000, reference: '2025-07', page: '471' },
  { category: '방수', name: '크린탄 3000(K)', spec: '우레탄 상도제', unit: '16Kg', price: 141000, reference: '2025-07', page: '471' },
  { category: '기와', name: '스톤 S골 성형 강판', spec: '914x670 / 0.45T', unit: 'm', price: 13520, reference: '2025-07', page: '462' },
  { category: '기와', name: '스톤 미시샤시', spec: '15x40x120x15x20x15x3,000', unit: '개', price: 18030, reference: '2025-07', page: '462' },
  { category: '기와', name: '스톤 상부 용마루', spec: '15x20x15x150x150x15x20x15x3,000', unit: '개', price: 40570, reference: '2025-07', page: '462' },
  { category: '기와', name: '스톤 전면 마감재', spec: '15x20x200x20x15x3,000', unit: '개', price: 16130, reference: '2025-07', page: '462' },
  { category: '기와', name: '뉴송', spec: '45x45x3,600mm', unit: '개', price: 5880, reference: '2025-07', page: '85' },
  { category: '도장', name: '에멀션 페인트 (외부)', spec: 'KSM-6010 1급 백색', unit: '18L', price: 130000, reference: '2025-07', page: '500' },
  { category: '도장', name: '에멀션 페인트 (내부)', spec: 'KSM-6010 1급 백색', unit: '18L', price: 101000, reference: '2025-07', page: '500' },
  { category: '도장', name: '다채무늬 도료', spec: '특수도료', unit: '18L', price: 163000, reference: '2025-07', page: '519' },
  { category: '발수', name: '발수제', spec: '친환경 발수제', unit: '18L', price: 38000, reference: '2025-07', page: '472' },
  { category: '보수', name: '아크릴릭 필러', spec: '외부용 백색', unit: '5Kg', price: 12000, reference: '2025-07', page: '501' },
  { category: '공통', name: '코킹제', spec: '1액형 변성 실리콘', unit: '270ml', price: 5000, reference: '2025-07', page: '473' },
  { category: '기와', name: '소봉', spec: '', unit: 'EA', price: 20000, reference: '직접입력', page: '' },
]

// ── 일위대가 공정 데이터 (공종별) ──

export interface ProcessItem {
  name: string
  spec: string
  qty: number
  unit: string
  laborPrice: number
  laborAmount: number
  expenseAmount: number
}

export interface ProcessTable {
  id: number
  name: string
  unit: string
  items: ProcessItem[]
  subtotal: { materialAmount: number; laborAmount: number; expenseAmount: number; totalAmount: number }
}

// 방수 일위대가 (8 공정)
export const WATERPROOF_PROCESSES: ProcessTable[] = [
  { id: 1, name: '바탕처리 바닥', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 6%', qty: 0.06, unit: '식', laborPrice: 10492, laborAmount: 0, expenseAmount: 629 },
      { name: '방수공', spec: '', qty: 0.036, unit: '인', laborPrice: 220722, laborAmount: 7945, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.015, unit: '인', laborPrice: 169804, laborAmount: 2547, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 629, laborAmount: 10492, expenseAmount: 0, totalAmount: 11121 },
  },
  { id: 2, name: '바탕처리 수직부', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 6%', qty: 0.06, unit: '식', laborPrice: 11714, laborAmount: 0, expenseAmount: 702 },
      { name: '방수공', spec: '', qty: 0.04, unit: '인', laborPrice: 220722, laborAmount: 8828, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.017, unit: '인', laborPrice: 169804, laborAmount: 2886, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 702, laborAmount: 11714, expenseAmount: 0, totalAmount: 12416 },
  },
  { id: 3, name: '방수 프라이머 바름', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 2%', qty: 0.02, unit: '식', laborPrice: 3276, laborAmount: 0, expenseAmount: 65 },
      { name: '방수공', spec: '', qty: 0.011, unit: '인', laborPrice: 220722, laborAmount: 2427, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.005, unit: '인', laborPrice: 169804, laborAmount: 849, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 65, laborAmount: 3276, expenseAmount: 0, totalAmount: 3341 },
  },
  { id: 4, name: '도막 방수 바름 바닥', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 2%', qty: 0.02, unit: '식', laborPrice: 4838, laborAmount: 0, expenseAmount: 96 },
      { name: '방수공', spec: '', qty: 0.015, unit: '인', laborPrice: 220722, laborAmount: 3310, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.009, unit: '인', laborPrice: 169804, laborAmount: 1528, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 96, laborAmount: 4838, expenseAmount: 0, totalAmount: 4934 },
  },
  { id: 5, name: '도막 방수 바름 수직부', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 2%', qty: 0.02, unit: '식', laborPrice: 6451, laborAmount: 0, expenseAmount: 129 },
      { name: '방수공', spec: '', qty: 0.02, unit: '인', laborPrice: 220722, laborAmount: 4414, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.012, unit: '인', laborPrice: 169804, laborAmount: 2037, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 129, laborAmount: 6451, expenseAmount: 0, totalAmount: 6580 },
  },
  { id: 6, name: '마감도료 바름 바닥', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 2%', qty: 0.02, unit: '식', laborPrice: 3497, laborAmount: 0, expenseAmount: 69 },
      { name: '방수공', spec: '', qty: 0.012, unit: '인', laborPrice: 220722, laborAmount: 2648, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.005, unit: '인', laborPrice: 169804, laborAmount: 849, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 69, laborAmount: 3497, expenseAmount: 0, totalAmount: 3566 },
  },
  { id: 7, name: '마감도료 바름 수직부', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 2%', qty: 0.02, unit: '식', laborPrice: 4498, laborAmount: 0, expenseAmount: 89 },
      { name: '방수공', spec: '', qty: 0.015, unit: '인', laborPrice: 220722, laborAmount: 3310, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.007, unit: '인', laborPrice: 169804, laborAmount: 1188, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 89, laborAmount: 4498, expenseAmount: 0, totalAmount: 4587 },
  },
  { id: 8, name: '수밀코킹', unit: 'm 당',
    items: [
      { name: '코킹공', spec: '', qty: 0.025, unit: '인', laborPrice: 206732, laborAmount: 5168, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 5168, expenseAmount: 0, totalAmount: 5168 },
  },
]

// 기와 일위대가 (5 공정)
export const TILE_PROCESSES: ProcessTable[] = [
  { id: 1, name: '금속기와 해체', unit: '㎡ 당',
    items: [
      { name: '지붕잇기공', spec: '', qty: 0.018, unit: '인', laborPrice: 224113, laborAmount: 4034, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.012, unit: '인', laborPrice: 169804, laborAmount: 2037, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 6071, expenseAmount: 0, totalAmount: 6071 },
  },
  { id: 2, name: '기와고정 각재 철거', unit: '㎡ 당',
    items: [
      { name: '건축목공', spec: '', qty: 0.04, unit: '인', laborPrice: 277894, laborAmount: 11115, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.02, unit: '인', laborPrice: 169804, laborAmount: 3396, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 14511, expenseAmount: 0, totalAmount: 14511 },
  },
  { id: 3, name: '기와고정 각재 설치', unit: '㎡ 당',
    items: [
      { name: '공구손료 및 기계경비', spec: '노무비의 4%', qty: 0.04, unit: '인', laborPrice: 16935, laborAmount: 0, expenseAmount: 677 },
      { name: '건축목공', spec: '', qty: 0.053, unit: '인', laborPrice: 277894, laborAmount: 14728, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.013, unit: '인', laborPrice: 169804, laborAmount: 2207, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 677, laborAmount: 16935, expenseAmount: 0, totalAmount: 17612 },
  },
  { id: 4, name: '금속판 평잇기', unit: '㎡ 당',
    items: [
      { name: '지붕잇기공', spec: '', qty: 0.07, unit: '인', laborPrice: 224113, laborAmount: 15687, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.01, unit: '인', laborPrice: 169804, laborAmount: 1698, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 17385, expenseAmount: 0, totalAmount: 17385 },
  },
  { id: 5, name: '후레싱 설치', unit: 'm 당',
    items: [
      { name: '지붕잇기공', spec: '', qty: 0.02, unit: '인', laborPrice: 224113, laborAmount: 4482, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 4482, expenseAmount: 0, totalAmount: 4482 },
  },
]

// 도장/발수 일위대가 (6 공정)
export const PAINTING_PROCESSES: ProcessTable[] = [
  { id: 1, name: '콘크리트 모르터면 바탕만들기', unit: '㎡ 당',
    items: [
      { name: '도장공', spec: '', qty: 0.01, unit: '인', laborPrice: 253409, laborAmount: 2534, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.001, unit: '인', laborPrice: 169804, laborAmount: 169, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 2703, expenseAmount: 0, totalAmount: 2703 },
  },
  { id: 2, name: '수성도료 롤러칠 (2회)', unit: '㎡ 당',
    items: [
      { name: '도장공', spec: '', qty: 0.024, unit: '인', laborPrice: 253409, laborAmount: 6081, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.004, unit: '인', laborPrice: 169804, laborAmount: 679, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 6760, expenseAmount: 0, totalAmount: 6760 },
  },
  { id: 3, name: '수성도료 롤러칠 (1회)', unit: '㎡ 당',
    items: [
      { name: '도장공', spec: '', qty: 0.012, unit: '인', laborPrice: 253409, laborAmount: 3040, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.002, unit: '인', laborPrice: 169804, laborAmount: 339, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 3379, expenseAmount: 0, totalAmount: 3379 },
  },
  { id: 4, name: '무늬코트 뿜칠', unit: '㎡ 당',
    items: [
      { name: '도장공', spec: '', qty: 0.056, unit: '인', laborPrice: 253409, laborAmount: 14190, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.011, unit: '인', laborPrice: 169804, laborAmount: 1867, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 16057, expenseAmount: 0, totalAmount: 16057 },
  },
  { id: 5, name: '발수제 도포 뿜칠', unit: '㎡ 당',
    items: [
      { name: '방수공', spec: '', qty: 0.011, unit: '인', laborPrice: 220722, laborAmount: 2427, expenseAmount: 0 },
      { name: '보통인부', spec: '', qty: 0.003, unit: '인', laborPrice: 169804, laborAmount: 509, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 2936, expenseAmount: 0, totalAmount: 2936 },
  },
  { id: 6, name: '수밀코킹', unit: 'm 당',
    items: [
      { name: '코킹공', spec: '', qty: 0.025, unit: '인', laborPrice: 206732, laborAmount: 5168, expenseAmount: 0 },
    ],
    subtotal: { materialAmount: 0, laborAmount: 5168, expenseAmount: 0, totalAmount: 5168 },
  },
]

// 공종별 일위대가 매핑
export const PROCESSES_BY_WORK_TYPE: Record<string, ProcessTable[]> = {
  waterproof: WATERPROOF_PROCESSES,
  tile: TILE_PROCESSES,
  wallPaint: PAINTING_PROCESSES,
  stairPaint: PAINTING_PROCESSES,
  wallWaterRepel: PAINTING_PROCESSES,
}

// ── 내역서 기본 템플릿 (공종별) ──

export interface DetailTemplateRow {
  name: string
  spec: string
  unit: string
  materialPrice: number
  laborPrice: number
  expensePrice: number
  isWaste: boolean
  areaRatio?: number | null     // 면적 비율 (예: 0.3 = 30%)
  defaultQty?: number | null    // 고정 수량 (면적 무관)
  qtyNote?: string              // 수량 산출 설명
}

// 방수 내역서 템플릿 (11 항목 + 1 폐기물)
export const WATERPROOF_DETAIL_TEMPLATE: DetailTemplateRow[] = [
  { name: '바탕정리 [바닥]', spec: '바닥면적의 30%', unit: '㎡', materialPrice: 629, laborPrice: 10492, expensePrice: 0, isWaste: false, areaRatio: 0.3, qtyNote: '옥상 바닥면적 × 30%' },
  { name: '바탕정리 [수직부]', spec: '수직면적의 20%', unit: '㎡', materialPrice: 702, laborPrice: 11714, expensePrice: 0, isWaste: false, areaRatio: 0.2, qtyNote: '옥상 수직면적 × 20%' },
  { name: '프라이머 바름 [바닥]', spec: '1회', unit: '㎡', materialPrice: 973, laborPrice: 3276, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 바닥면적' },
  { name: '프라이머 바름 [수직부]', spec: '1회', unit: '㎡', materialPrice: 973, laborPrice: 3276, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 수직면적' },
  { name: '도막 방수 [바닥]', spec: '3mm', unit: '㎡', materialPrice: 24276, laborPrice: 4838, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 바닥면적' },
  { name: '도막 방수 [수직부]', spec: '1회', unit: '㎡', materialPrice: 17737, laborPrice: 6451, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 수직면적' },
  { name: '마감도료 [바닥]', spec: '1회', unit: '㎡', materialPrice: 950, laborPrice: 3497, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 바닥면적' },
  { name: '마감도료 [수직부]', spec: '1회', unit: '㎡', materialPrice: 970, laborPrice: 4498, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '옥상 수직면적' },
  { name: '코킹작업', spec: '', unit: 'm', materialPrice: 741, laborPrice: 5168, expensePrice: 0, isWaste: false, defaultQty: 40, qtyNote: '직접 입력' },
  { name: '고소장비', spec: '사다리차', unit: '시간', materialPrice: 0, laborPrice: 0, expensePrice: 70000, isWaste: false, defaultQty: 3, qtyNote: '직접 입력' },
  { name: '물탱크 철거', spec: '미장포함', unit: '식', materialPrice: 0, laborPrice: 0, expensePrice: 300000, isWaste: false, defaultQty: 1, qtyNote: '직접 입력' },
  { name: '폐기물 처리비용', spec: '2.5ton 미만', unit: '대', materialPrice: 0, laborPrice: 0, expensePrice: 350000, isWaste: true, defaultQty: 1, qtyNote: '원가계산서 직접 반영' },
]

// 기와 내역서 템플릿 (12 항목 + 1 폐기물)
export const TILE_DETAIL_TEMPLATE: DetailTemplateRow[] = [
  { name: '구조체별 철거 [지붕]', spec: '기와', unit: '㎡', materialPrice: 0, laborPrice: 6071, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '기와 면적' },
  { name: '구조체별 철거 [각재]', spec: '기와 지지목', unit: '㎡', materialPrice: 0, laborPrice: 14511, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '기와 면적' },
  { name: '컬러 강판', spec: '914x670 / 0.45T', unit: 'm', materialPrice: 13520, laborPrice: 0, expensePrice: 0, isWaste: false, areaRatio: 2, qtyNote: '기와 면적 × 2' },
  { name: '컬러 강판 시공', spec: '금속판 평잇기', unit: '㎡', materialPrice: 0, laborPrice: 17385, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '기와 면적' },
  { name: '미시샤시', spec: '', unit: 'EA', materialPrice: 18030, laborPrice: 0, expensePrice: 0, isWaste: false, defaultQty: 4, qtyNote: '직접 입력' },
  { name: '상부 용마루', spec: '', unit: 'EA', materialPrice: 40570, laborPrice: 0, expensePrice: 0, isWaste: false, defaultQty: 8, qtyNote: '직접 입력' },
  { name: '전면 마감재', spec: '', unit: 'EA', materialPrice: 16130, laborPrice: 0, expensePrice: 0, isWaste: false, defaultQty: 8, qtyNote: '직접 입력' },
  { name: '후레싱 설치', spec: '', unit: 'm', materialPrice: 0, laborPrice: 4482, expensePrice: 0, isWaste: false, defaultQty: 60, qtyNote: '직접 입력' },
  { name: '소봉', spec: '', unit: 'EA', materialPrice: 20000, laborPrice: 0, expensePrice: 0, isWaste: false, defaultQty: 4, qtyNote: '직접 입력' },
  { name: '각재', spec: '45x45x3600mm', unit: 'EA', materialPrice: 5880, laborPrice: 0, expensePrice: 0, isWaste: false, defaultQty: 40, qtyNote: '직접 입력' },
  { name: '각재 설치', spec: '기와 고정용', unit: '㎡', materialPrice: 677, laborPrice: 16935, expensePrice: 0, isWaste: false, areaRatio: 1.2, qtyNote: '기와 면적 × 1.2' },
  { name: '고소장비', spec: '스카이', unit: '일', materialPrice: 0, laborPrice: 0, expensePrice: 600000, isWaste: false, defaultQty: 1, qtyNote: '직접 입력' },
  { name: '폐기물 처리비용', spec: '2.5ton 미만', unit: '대', materialPrice: 0, laborPrice: 0, expensePrice: 350000, isWaste: true, defaultQty: 1, qtyNote: '원가계산서 직접 반영' },
]

// 외벽도장 내역서 템플릿 (4 항목)
export const WALL_PAINT_DETAIL_TEMPLATE: DetailTemplateRow[] = [
  { name: '바탕만들기', spec: '외벽면적의 30%', unit: '㎡', materialPrice: 1200, laborPrice: 2703, expensePrice: 0, isWaste: false, areaRatio: 0.3, qtyNote: '외벽 면적 × 30%' },
  { name: '수성페인트 롤러칠', spec: '외벽면적의 70%', unit: '㎡', materialPrice: 2456, laborPrice: 6760, expensePrice: 0, isWaste: false, areaRatio: 0.7, qtyNote: '외벽 면적 × 70%' },
  { name: '코킹작업', spec: '외부크랙용', unit: 'm', materialPrice: 741, laborPrice: 5168, expensePrice: 0, isWaste: false, defaultQty: null, qtyNote: '세대수 × 50' },
  { name: '고소장비', spec: '스카이', unit: '일', materialPrice: 0, laborPrice: 0, expensePrice: 600000, isWaste: false, defaultQty: 3, qtyNote: '직접 입력' },
]

// 계단실도장 내역서 템플릿 (3 항목)
export const STAIR_PAINT_DETAIL_TEMPLATE: DetailTemplateRow[] = [
  { name: '바탕만들기', spec: '계단실면적의 70%', unit: '㎡', materialPrice: 1200, laborPrice: 2703, expensePrice: 0, isWaste: false, areaRatio: 0.7, qtyNote: '계단실 면적 × 70%' },
  { name: '수성페인트 롤러칠', spec: '계단실면적', unit: '㎡', materialPrice: 931, laborPrice: 3379, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '계단실 면적' },
  { name: '무늬코트 뿜칠', spec: '계단실면적의 30%', unit: '㎡', materialPrice: 1449, laborPrice: 16057, expensePrice: 0, isWaste: false, areaRatio: 0.3, qtyNote: '계단실 면적 × 30%' },
]

// 외벽발수 내역서 템플릿 (4 항목)
export const WATER_REPEL_DETAIL_TEMPLATE: DetailTemplateRow[] = [
  { name: '바탕만들기', spec: '외벽면적의 30%', unit: '㎡', materialPrice: 1200, laborPrice: 2703, expensePrice: 0, isWaste: false, areaRatio: 0.3, qtyNote: '외벽 면적 × 30%' },
  { name: '외벽방수제 도포', spec: '외벽면적', unit: '㎡', materialPrice: 359, laborPrice: 2936, expensePrice: 0, isWaste: false, areaRatio: 1, qtyNote: '외벽 면적' },
  { name: '코킹작업', spec: '외부크랙용', unit: 'm', materialPrice: 741, laborPrice: 5168, expensePrice: 0, isWaste: false, defaultQty: null, qtyNote: '세대수 × 50' },
  { name: '고소장비', spec: '스카이', unit: '일', materialPrice: 0, laborPrice: 0, expensePrice: 600000, isWaste: false, defaultQty: 3, qtyNote: '직접 입력' },
]

// 공종별 내역서 템플릿 매핑
export const DETAIL_TEMPLATES: Record<WorkType, DetailTemplateRow[]> = {
  waterproof: WATERPROOF_DETAIL_TEMPLATE,
  tile: TILE_DETAIL_TEMPLATE,
  wallPaint: WALL_PAINT_DETAIL_TEMPLATE,
  stairPaint: STAIR_PAINT_DETAIL_TEMPLATE,
  wallWaterRepel: WATER_REPEL_DETAIL_TEMPLATE,
}

// ── 실측 치수 ↔ 공종 매핑 (어떤 실측이 어디에 필요한지) ──

export interface MeasurementGroup {
  label: string
  description: string
  fields: { key: string; label: string; unit: string }[]
  relatedWorkTypes: WorkType[]
}

export const MEASUREMENT_GROUPS: MeasurementGroup[] = [
  {
    label: '옥상 (방수·기와)',
    description: '옥상방수, 금속기와 면적 산출에 사용',
    fields: [
      { key: 'roofW', label: '옥상 가로', unit: 'm' },
      { key: 'roofL', label: '옥상 세로', unit: 'm' },
      { key: 'roofV', label: '옥상 수직', unit: 'm' },
    ],
    relatedWorkTypes: ['waterproof', 'tile'],
  },
  {
    label: '기와 추가',
    description: '금속기와 면적 산출에 추가로 필요',
    fields: [
      { key: 'tileW', label: '기와 폭', unit: 'm' },
    ],
    relatedWorkTypes: ['tile'],
  },
  {
    label: '외벽 (도장·발수)',
    description: '외벽도장, 외벽발수 면적 산출에 사용',
    fields: [
      { key: 'wallW', label: '외벽 가로', unit: 'm' },
      { key: 'wallL', label: '외벽 세로', unit: 'm' },
    ],
    relatedWorkTypes: ['wallPaint', 'wallWaterRepel'],
  },
  {
    label: '계단실 (도장)',
    description: '계단실도장 면적 산출에 사용',
    fields: [
      { key: 'stairW', label: '계단 가로', unit: 'm' },
      { key: 'stairL', label: '계단 세로', unit: 'm' },
    ],
    relatedWorkTypes: ['stairPaint'],
  },
  {
    label: '건물 공통',
    description: '외벽·계단실 높이 산출에 공통 사용',
    fields: [
      { key: 'buildingH', label: '건물높이', unit: 'm' },
    ],
    relatedWorkTypes: ['wallPaint', 'stairPaint', 'wallWaterRepel'],
  },
]
