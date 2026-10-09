import { describe, expect, it } from 'vitest'
import { PROGRESS_STEPS, TRANSITION_RULES, missingFieldsForMove, stepIndex, type StepRuleProject } from './stepRules'

// 모든 필수항목이 채워진 건
const FULL: StepRuleProject = {
  building_name: '행복빌라',
  road_address: '경기도 수원시 팔달구 효원로 1',
  owner_name: '김영수',
  owner_phone: '010-1234-5678',
  note: '옥상 방수 문의',
  survey_date: '2026-10-01',
  survey_staff: '김재호',
  total_cost: 5_000_000,
  consent_date: '2026-10-02',
  application_date: '2026-10-03',
  application_submitter: '김재호',
  approval_received_date: '2026-10-04',
  construction_date: '2026-10-05',
  construction_end_date: '2026-10-06',
  completion_doc_date: '2026-10-07',
  completion_submitter: '김재호',
}

describe('PROGRESS_STEPS / TRANSITION_RULES', () => {
  it('10단계 순서를 지킨다', () => {
    expect(PROGRESS_STEPS).toEqual([
      '문의', '실측', '견적전달', '동의서', '신청서제출',
      '승인', '착공계', '공사', '완료서류제출', '입금',
    ])
    expect(stepIndex('견적전달')).toBe(2)
    expect(stepIndex('취소')).toBe(-1)
  })

  it('이웃한 단계마다 규칙 항목이 있다 (빠진 경계 없음)', () => {
    for (let i = 0; i < PROGRESS_STEPS.length - 1; i++) {
      expect(TRANSITION_RULES[`${PROGRESS_STEPS[i]}->${PROGRESS_STEPS[i + 1]}`]).toBeDefined()
    }
  })
})

describe('missingFieldsForMove', () => {
  it('한 단계 앞으로: 그 경계의 빈 항목만 알려준다 (상세 패널 "다음" 버튼과 같음)', () => {
    const p = { ...FULL, survey_date: null, survey_staff: '' }
    expect(missingFieldsForMove(p, '실측', '견적전달')).toEqual(['실측일', '실측 담당자'])
  })

  it('다 채워져 있으면 빈 목록', () => {
    expect(missingFieldsForMove(FULL, '문의', '입금')).toEqual([])
  })

  it('여러 단계를 건너뛰면 사이의 경계를 모두 본다', () => {
    const p = { ...FULL, owner_phone: null, survey_date: null, total_cost: 0 }
    // 문의->실측, 실측->견적전달, 견적전달->동의서
    expect(missingFieldsForMove(p, '문의', '동의서')).toEqual(['연락처', '실측일', '총공사비'])
  })

  it('목표 단계 뒤의 경계는 보지 않는다', () => {
    const p = { ...FULL, completion_doc_date: null }
    expect(missingFieldsForMove(p, '문의', '완료서류제출')).toEqual([])
    expect(missingFieldsForMove(p, '문의', '입금')).toEqual(['완료서류 제출일'])
  })

  it('출발 단계 앞의 경계는 보지 않는다', () => {
    const p = { ...FULL, building_name: null, survey_date: null }
    expect(missingFieldsForMove(p, '견적전달', '동의서')).toEqual([])
  })

  it('두 제출자는 서로 구분되는 이름으로 나온다', () => {
    const p = { ...FULL, application_submitter: null, completion_submitter: null }
    expect(missingFieldsForMove(p, '신청서제출', '입금')).toEqual(['신청서 제출자', '완료서류 제출자'])
  })

  it('뒤로 가거나 같은 단계면 검사하지 않는다', () => {
    const empty: StepRuleProject = {}
    expect(missingFieldsForMove(empty, '공사', '실측')).toEqual([])
    expect(missingFieldsForMove(empty, '실측', '실측')).toEqual([])
  })

  it('취소·문의(예약)으로 바꿀 때는 검사하지 않는다', () => {
    const empty: StepRuleProject = {}
    expect(missingFieldsForMove(empty, '공사', '취소')).toEqual([])
    expect(missingFieldsForMove(empty, '문의', '문의(예약)')).toEqual([])
  })

  it('취소·문의(예약)에서 되돌릴 때는 문의부터 목표까지 본다', () => {
    const p = { ...FULL, note: null, survey_staff: null }
    expect(missingFieldsForMove(p, '문의(예약)', '실측')).toEqual(['상담내역'])
    expect(missingFieldsForMove(p, '취소', '견적전달')).toEqual(['상담내역', '실측 담당자'])
    expect(missingFieldsForMove({}, '문의(예약)', '문의')).toEqual([])
  })

  it('총공사비가 비어 있으면(null) 0원으로 본다', () => {
    expect(missingFieldsForMove({ ...FULL, total_cost: null }, '견적전달', '동의서')).toEqual(['총공사비'])
  })
})
