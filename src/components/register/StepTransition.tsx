'use client'

import { useState, useCallback } from 'react'
import { ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { insertStatusLog } from '@/lib/statusLog/client'
import { validateProjectData } from '@/lib/utils/validate'
import type { DBProject, ProjectStep } from '@/components/register/RegisterPage'
import { toast } from '@/lib/toast'
// 필수항목 규칙은 목록 드롭다운과 같이 쓰려고 lib으로 옮겼다
import { PROGRESS_STEPS, missingFieldsForMove } from '@/lib/register/stepRules'

interface Props {
  project: DBProject
  /**
   * 화면에 입력했지만 아직 자동저장(3초 뒤)되지 않은 값. 필수항목 확인에 함께 본다.
   * 예전에는 저장된 값만 봐서, 실측일을 넣자마자 "다음 단계"를 누르면
   * "실측일을 입력해주세요"가 떴다. 입력값은 자동저장이 그대로 이어서 저장한다.
   */
  pendingEdits?: Record<string, string | number | null>
  onStepChange: () => void
}

export default function StepTransition({ project, pendingEdits, onStepChange }: Props) {
  const [errors, setErrors] = useState<string[]>([])
  const [changing, setChanging] = useState(false)

  const currentIdx = PROGRESS_STEPS.indexOf(project.status as ProjectStep)
  const canGoNext = currentIdx >= 0 && currentIdx < PROGRESS_STEPS.length - 1
  const canGoPrev = currentIdx > 0

  const changeStep = useCallback(async (newStep: ProjectStep) => {
    setChanging(true)
    setErrors([])
    try {
      const logged = await insertStatusLog({
        projectId: project.id,
        fromStatus: project.status,
        toStatus: newStep,
        note: null,
      })
      if (!logged.ok) {
        toast.error(logged.error)
        return
      }

      const { error } = await supabase
        .from('projects')
        .update({ status: newStep })
        .eq('id', project.id)
      if (error) throw error

      onStepChange()
    } catch (err) {
      console.error('단계 변경 실패:', err)
      toast.error('단계 변경에 실패했습니다.')
    } finally {
      setChanging(false)
    }
  }, [project, onStepChange])

  const handleNext = useCallback(() => {
    if (!canGoNext) return

    const nextStep = PROGRESS_STEPS[currentIdx + 1]

    // 저장될 때와 같은 검사(validateProjectData)를 거친 값만 본다 — 쓰다 만 날짜는 빈 값으로 본다
    const view = { ...project, ...validateProjectData({ ...(pendingEdits ?? {}) }) } as DBProject
    const missing = missingFieldsForMove(view, project.status, nextStep)
    if (missing.length > 0) {
      setErrors(missing)
      return
    }

    changeStep(nextStep)
  }, [canGoNext, currentIdx, project, pendingEdits, changeStep])

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
              className="flex items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {changing ? '변경중...' : `다음: ${PROGRESS_STEPS[currentIdx + 1]}`} <ChevronRight size={12} />
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
