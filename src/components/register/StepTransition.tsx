'use client'

import { useState, useCallback } from 'react'
import { ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'

const PROGRESS_STEPS: ProjectStep[] = [
  '문의', '실측', '견적전달', '동의서', '신청서제출',
  '승인', '착공계', '공사', '완료서류제출', '입금',
]

interface ValidationRule {
  field: string
  label: string
  check: (project: DBProject) => boolean
}

// 단계 전환 시 필수 입력 검증 규칙
const TRANSITION_RULES: Record<string, ValidationRule[]> = {
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
    { field: 'total_cost', label: '총공사비', check: p => p.total_cost > 0 },
  ],
  '동의서->신청서제출': [
    { field: 'consent_date', label: '동의서 수령일', check: p => !!p.consent_date },
  ],
  '신청서제출->승인': [
    { field: 'application_date', label: '신청서 제출일', check: p => !!p.application_date },
    { field: 'application_submitter', label: '제출자', check: p => !!p.application_submitter },
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
    { field: 'completion_submitter', label: '제출자', check: p => !!p.completion_submitter },
  ],
}

interface Props {
  project: DBProject
  onStepChange: () => void
}

export default function StepTransition({ project, onStepChange }: Props) {
  const [errors, setErrors] = useState<string[]>([])
  const [changing, setChanging] = useState(false)

  const currentIdx = PROGRESS_STEPS.indexOf(project.status as ProjectStep)
  const canGoNext = currentIdx >= 0 && currentIdx < PROGRESS_STEPS.length - 1
  const canGoPrev = currentIdx > 0

  const changeStep = useCallback(async (newStep: ProjectStep) => {
    setChanging(true)
    setErrors([])
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: newStep })
        .eq('id', project.id)
      if (error) throw error

      // status_logs에 기록
      await supabase.from('status_logs').insert({
        project_id: project.id,
        from_status: project.status,
        to_status: newStep,
        note: null,
      })

      onStepChange()
    } catch (err) {
      console.error('단계 변경 실패:', err)
      alert('단계 변경에 실패했습니다.')
    } finally {
      setChanging(false)
    }
  }, [project, onStepChange])

  const handleNext = useCallback(() => {
    if (!canGoNext) return

    const nextStep = PROGRESS_STEPS[currentIdx + 1]
    const ruleKey = `${project.status}->${nextStep}`
    const rules = TRANSITION_RULES[ruleKey] || []

    const failed = rules.filter(r => !r.check(project))
    if (failed.length > 0) {
      setErrors(failed.map(r => r.label))
      return
    }

    changeStep(nextStep)
  }, [canGoNext, currentIdx, project, changeStep])

  const handlePrev = useCallback(() => {
    if (!canGoPrev) return
    changeStep(PROGRESS_STEPS[currentIdx - 1])
  }, [canGoPrev, currentIdx, changeStep])

  if (currentIdx < 0) return null

  return (
    <div className="px-6 py-2 border-b border-border-tertiary">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canGoPrev && (
            <button
              onClick={handlePrev}
              disabled={changing}
              className="flex items-center gap-0.5 px-2 py-1 text-[11px] text-txt-tertiary border border-border-primary rounded-md hover:bg-surface-secondary transition-colors disabled:opacity-50"
            >
              <ChevronLeft size={12} /> 이전
            </button>
          )}
          {canGoNext && (
            <button
              onClick={handleNext}
              disabled={changing}
              className="flex items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-white bg-[#c96442] rounded-md hover:bg-[#b5573a] transition-colors disabled:opacity-50"
            >
              {changing ? '변경중...' : `${PROGRESS_STEPS[currentIdx + 1]}으로`} <ChevronRight size={12} />
            </button>
          )}
          {project.status === '입금' && (
            <span className="text-[11px] text-status-done-text font-medium">완료</span>
          )}
        </div>

      </div>

      {/* 검증 에러 표시 */}
      {errors.length > 0 && (
        <div className="mt-2 p-2 bg-danger-bg rounded-md flex items-start gap-2">
          <AlertCircle size={14} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-danger font-medium">다음 항목을 입력해주세요:</p>
            <ul className="text-[11px] text-danger mt-0.5">
              {errors.map(e => <li key={e}>- {e}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
