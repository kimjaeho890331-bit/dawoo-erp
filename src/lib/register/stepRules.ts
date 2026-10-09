/**
 * 접수대장 단계 전환 필수항목 규칙.
 *
 * 예전에는 규칙이 상세 패널의 "다음" 버튼(StepTransition) 안에만 있어서,
 * 목록의 단계 드롭다운으로 바꾸면 검사 없이 넘어갔다. 두 곳이 같은 규칙을 쓰도록 여기로 뺐다.
 */

// 10단계 순서 (취소·문의(예약)은 순서 밖 특수 상태)
export const PROGRESS_STEPS = [
  '문의', '실측', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
] as const

export type ProgressStep = (typeof PROGRESS_STEPS)[number]

/** 규칙이 보는 필드만 — DBProject를 그대로 넘겨도 되고, 테스트에서는 일부만 넘겨도 된다 */
export interface StepRuleProject {
  building_name?: string | null
  road_address?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  note?: string | null
  survey_date?: string | null
  survey_staff?: string | null
  total_cost?: number | null
  consent_date?: string | null
  application_date?: string | null
  application_submitter?: string | null
  approval_received_date?: string | null
  construction_date?: string | null
  construction_end_date?: string | null
  completion_doc_date?: string | null
  completion_submitter?: string | null
}

export interface StepRule {
  field: keyof StepRuleProject
  label: string
  check: (project: StepRuleProject) => boolean
}

// 단계 전환 시 필수 입력 검증 규칙 ('이전단계->다음단계')
// 제출자는 두 단계에 다 있어서, 여러 단계를 한 번에 건너뛸 때 구분되도록 앞에 무엇의 제출자인지 붙였다
export const TRANSITION_RULES: Record<string, StepRule[]> = {
  '문의->실측': [
    { field: 'building_name', label: '빌라명', check: p => !!p.building_name },
    { field: 'road_address', label: '주소', check: p => !!p.road_address },
    { field: 'owner_name', label: '소유주', check: p => !!p.owner_name },
    { field: 'owner_phone', label: '연락처', check: p => !!p.owner_phone },
    { field: 'note', label: '상담내역', check: p => !!p.note },
  ],
  '실측->견적전달': [
    { field: 'survey_date', label: '실측일', check: p => !!p.survey_date },
    { field: 'survey_staff', label: '실측 담당자', check: p => !!p.survey_staff },
  ],
  '견적전달->동의서': [
    { field: 'total_cost', label: '총공사비', check: p => (p.total_cost ?? 0) > 0 },
  ],
  '동의서->신청서제출': [
    { field: 'consent_date', label: '동의서 수령일', check: p => !!p.consent_date },
  ],
  '신청서제출->승인': [
    { field: 'application_date', label: '신청서 제출일', check: p => !!p.application_date },
    { field: 'application_submitter', label: '신청서 제출자', check: p => !!p.application_submitter },
  ],
  '승인->착공계': [
    { field: 'approval_received_date', label: '승인일', check: p => !!p.approval_received_date },
    { field: 'construction_date', label: '시공일', check: p => !!p.construction_date },
  ],
  '착공계->공사': [],
  '공사->완료서류제출': [
    { field: 'construction_end_date', label: '공사완료일', check: p => !!p.construction_end_date },
  ],
  '완료서류제출->입금': [
    { field: 'completion_doc_date', label: '완료서류 제출일', check: p => !!p.completion_doc_date },
    { field: 'completion_submitter', label: '완료서류 제출자', check: p => !!p.completion_submitter },
  ],
}

export function stepIndex(status: string): number {
  return (PROGRESS_STEPS as readonly string[]).indexOf(status)
}

/**
 * from → to 로 옮길 때 비어 있는 필수항목 이름들.
 * 사이에 낀 단계 경계의 규칙을 모두 본다 (문의→견적전달이면 문의->실측, 실측->견적전달 둘 다).
 *
 * - 뒤로 가거나 같은 단계, 취소·문의(예약)으로 바꾸는 것은 검사하지 않는다 → []
 * - 취소·문의(예약)에서 다시 단계로 되돌릴 때는 원래 어디였는지 모르므로
 *   '문의'에서 출발한 것으로 보고 목표 단계까지의 규칙을 모두 본다.
 */
export function missingFieldsForMove(project: StepRuleProject, from: string, to: string): string[] {
  const toIdx = stepIndex(to)
  if (toIdx < 0) return []
  const fromIdx = Math.max(stepIndex(from), 0)
  if (toIdx <= fromIdx) return []

  const labels: string[] = []
  for (let i = fromIdx; i < toIdx; i++) {
    const rules = TRANSITION_RULES[`${PROGRESS_STEPS[i]}->${PROGRESS_STEPS[i + 1]}`] ?? []
    for (const rule of rules) {
      if (!rule.check(project) && !labels.includes(rule.label)) labels.push(rule.label)
    }
  }
  return labels
}
