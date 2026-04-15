/**
 * DB 저장 전 필드별 타입 검증 + 자동 포맷
 *
 * 규칙:
 * - 유효하지 않은 값은 null로 치환 (DB 오염 방지)
 * - 자동 보정 가능한 값은 보정 후 저장
 * - 새 필드 추가 시 FIELD_SCHEMA에 등록 필수
 */

type FieldType = 'date' | 'time' | 'number' | 'phone' | 'text' | 'json'

interface FieldRule {
  type: FieldType
  required?: boolean
}

// projects 테이블 필드 스키마
const PROJECT_FIELD_SCHEMA: Record<string, FieldRule> = {
  // 날짜 (YYYY-MM-DD)
  survey_date: { type: 'date' },
  construction_date: { type: 'date' },
  application_date: { type: 'date' },
  completion_doc_date: { type: 'date' },
  consent_date: { type: 'date' },
  approval_received_date: { type: 'date' },
  construction_end_date: { type: 'date' },
  construction_doc_date: { type: 'date' },
  receipt_date: { type: 'date' },
  approval_date: { type: 'date' },
  payment_date: { type: 'date' },
  // 시간 (HH:MM)
  survey_time: { type: 'time' },
  consent_time: { type: 'time' },
  application_time: { type: 'time' },
  construction_time: { type: 'time' },
  construction_doc_time: { type: 'time' },
  completion_doc_time: { type: 'time' },
  // 숫자
  total_cost: { type: 'number' },
  self_pay: { type: 'number' },
  city_support: { type: 'number' },
  additional_cost: { type: 'number' },
  outstanding: { type: 'number' },
  down_payment: { type: 'number' },
  design_amount: { type: 'number' },
  collected: { type: 'number' },
  balance: { type: 'number' },
  unit_count: { type: 'number' },
  exclusive_area: { type: 'number' },
  area: { type: 'number' },
  year: { type: 'number' },
  // 전화번호
  owner_phone: { type: 'phone' },
  tenant_phone: { type: 'phone' },
  // JSON
  extra_fields: { type: 'json' },
  // 나머지 text 필드는 스키마에 없으면 text로 처리
}

/** 날짜 검증: YYYY-MM-DD만 허용, T이후 제거 */
function validateDate(v: string): string | null {
  const d = v.substring(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** 시간 검증: HH:MM만 허용, 숫자만이면 자동 콜론 */
function validateTime(v: string): string | null {
  if (/^\d{1,2}:\d{2}$/.test(v)) return v
  const digits = v.replace(/[^0-9]/g, '')
  if (digits.length >= 3 && digits.length <= 4) {
    const formatted = digits.substring(0, digits.length - 2) + ':' + digits.substring(digits.length - 2)
    const [h, m] = formatted.split(':').map(Number)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return formatted
  }
  return null
}

/** 숫자 검증: 숫자만 허용 */
function validateNumber(v: string | number): number | null {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''))
  return isNaN(n) ? null : n
}

/** 전화번호 검증: 숫자+하이픈만 허용 */
function validatePhone(v: string): string | null {
  const cleaned = v.replace(/[^0-9-]/g, '')
  return cleaned || null
}

/**
 * DB 저장 전 데이터 검증
 * 유효하지 않은 값은 null로 치환, 자동 보정 가능하면 보정
 */
export function validateProjectData(data: Record<string, string | number | null | undefined | object>): Record<string, string | number | null> {
  const validated: Record<string, string | number | null> = {}

  for (const [key, value] of Object.entries(data)) {
    // null/undefined → null
    if (value === null || value === undefined) {
      validated[key] = null
      continue
    }

    const rule = PROJECT_FIELD_SCHEMA[key]

    if (!rule) {
      // 스키마에 없는 필드는 text로 간주
      validated[key] = typeof value === 'object' ? value as unknown as null : value as string | number
      continue
    }

    switch (rule.type) {
      case 'date':
        validated[key] = typeof value === 'string' ? validateDate(value) : null
        break
      case 'time':
        validated[key] = typeof value === 'string' ? validateTime(value) : null
        break
      case 'number':
        validated[key] = validateNumber(value as string | number)
        break
      case 'phone':
        validated[key] = typeof value === 'string' ? validatePhone(value) : null
        break
      case 'json':
        validated[key] = value as unknown as null // JSON은 그대로 (Supabase가 처리)
        break
      default:
        validated[key] = typeof value === 'object' ? value as unknown as null : value as string | number
    }
  }

  return validated
}
