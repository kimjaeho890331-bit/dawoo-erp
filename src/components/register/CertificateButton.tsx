'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2, CheckCircle2, AlertCircle, ExternalLink, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface CoworkTask {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result_drive_file_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

interface Props {
  projectId: string
}

/**
 * 건축물대장 발급 버튼 + 상태 표시
 * - 클릭 → /api/certificate/request → cowork_tasks INSERT
 * - Realtime 구독으로 status 변화 즉시 반영
 * - 상태: idle | pending | processing | done | failed
 */
export default function CertificateButton({ projectId }: Props) {
  const [task, setTask] = useState<CoworkTask | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 최근 task 조회 (가장 최근 것 하나)
  const loadLatestTask = useCallback(async () => {
    const { data } = await supabase
      .from('cowork_tasks')
      .select('id, status, result_drive_file_url, error_message, created_at, updated_at')
      .eq('project_id', projectId)
      .eq('task_type', 'issue_certificate')
      .order('created_at', { ascending: false })
      .limit(1)
    setTask(data && data.length > 0 ? (data[0] as CoworkTask) : null)
  }, [projectId])

  useEffect(() => {
    loadLatestTask()
  }, [loadLatestTask])

  // Realtime: 이 프로젝트의 cowork_tasks 변화 감지
  useEffect(() => {
    const ch = supabase
      .channel(`cowork_tasks-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cowork_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        () => loadLatestTask(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [projectId, loadLatestTask])

  const requestIssue = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/certificate/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '요청 실패')
      await loadLatestTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const isActive = task && (task.status === 'pending' || task.status === 'processing')
  const isDone = task?.status === 'done'
  const isFailed = task?.status === 'failed'

  // ===== 진행중 상태 =====
  if (isActive) {
    const label = task!.status === 'pending' ? '대기중' : '발급중'
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[#c96442] bg-[#faf0eb] border border-[#e8d5cc] rounded-lg">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        건축물대장 {label}...
      </div>
    )
  }

  // ===== 완료 상태 =====
  if (isDone && task!.result_drive_file_url) {
    return (
      <div className="flex items-center gap-1.5">
        <a
          href={task!.result_drive_file_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#065f46] bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg hover:bg-[#d1fae5] transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          건축물대장 PDF
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={requestIssue}
          disabled={loading}
          title="재발급"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-primary text-txt-tertiary hover:text-[#c96442] hover:border-[#c96442] transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  // ===== 실패 상태 =====
  if (isFailed) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={requestIssue}
          disabled={loading}
          title={task!.error_message || '오류'}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#b91c1c] bg-[#fef2f2] border border-[#fecaca] rounded-lg hover:bg-[#fee2e2] transition-colors disabled:opacity-50"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          발급 실패 · 재시도
        </button>
      </div>
    )
  }

  // ===== 초기 상태 =====
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={requestIssue}
        disabled={loading}
        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#c96442] border border-[#c96442]/30 rounded-lg hover:bg-[#c96442]/5 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        건축물대장 발급
      </button>
      {error && (
        <p className="text-[10px] text-[#b91c1c]">{error}</p>
      )}
    </div>
  )
}
