'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Loader2, CheckCircle2, AlertCircle, ExternalLink, RotateCcw, History,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

interface CoworkTask {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result_drive_file_id: string | null
  result_drive_file_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  done_at: string | null
}

interface Props {
  projectId: string
  buildingName?: string | null
}

const isDev = process.env.NODE_ENV === 'development'

/**
 * 건축물대장 발급 버튼 + realtime 상태 + 토스트 + 이력 토글
 *
 * 핵심 기능:
 * 1) Supabase realtime 구독으로 cowork_tasks status 변화 즉시 반영
 * 2) 낙관적 업데이트: 클릭 시 즉시 pending 상태 표시
 * 3) status 변경 감지 시 토스트 알림 (done/failed)
 * 4) 발급 이력 토글 (시간순)
 * 5) dev 환경에서 디버그 정보 표시
 */
export default function CertificateButton({ projectId, buildingName }: Props) {
  const [latest, setLatest] = useState<CoworkTask | null>(null)
  const [history, setHistory] = useState<CoworkTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // 이전 상태 추적 (토스트 트리거용)
  const prevStatusRef = useRef<string | null>(null)

  // task 목록 로드
  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('cowork_tasks')
      .select('id, status, result_drive_file_id, result_drive_file_url, error_message, created_at, updated_at, done_at')
      .eq('project_id', projectId)
      .eq('task_type', 'issue_certificate')
      .order('created_at', { ascending: false })
      .limit(20)
    const tasks = (data as CoworkTask[]) || []
    setHistory(tasks)
    const newest = tasks[0] || null
    setLatest(newest)

    // 상태 전이 감지 → 토스트
    if (newest && prevStatusRef.current && prevStatusRef.current !== newest.status) {
      const buildingLabel = buildingName || '건축물대장'
      if (newest.status === 'done') {
        toast.success(`✅ ${buildingLabel} 발급 완료`)
      } else if (newest.status === 'failed') {
        toast.error(`❌ ${buildingLabel} 실패: ${newest.error_message || '알 수 없는 오류'}`)
      }
    }
    prevStatusRef.current = newest?.status || null
  }, [projectId, buildingName])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Realtime 구독 — INSERT/UPDATE/DELETE 모두 감지
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
        () => loadTasks(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [projectId, loadTasks])

  const requestIssue = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    // 낙관적 업데이트: 즉시 pending 상태 표시
    const optimisticTask: CoworkTask = {
      id: `optimistic-${Date.now()}`,
      status: 'pending',
      result_drive_file_id: null,
      result_drive_file_url: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      done_at: null,
    }
    setLatest(optimisticTask)
    prevStatusRef.current = 'pending'

    try {
      const res = await fetch('/api/certificate/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) {
        // 409 (이미 진행중)이면 기존 task 다시 로드
        if (res.status === 409) {
          await loadTasks()
          throw new Error(data.error || '이미 진행중')
        }
        throw new Error(data.error || '요청 실패')
      }
      // 실제 task 로드 (realtime이 INSERT를 잡아줄 거지만 즉시 동기화)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // 낙관적 업데이트 롤백
      await loadTasks()
    } finally {
      setLoading(false)
    }
  }

  // 상태별 표시 정보
  const isActive = latest && (latest.status === 'pending' || latest.status === 'processing')
  const isDone = latest?.status === 'done'
  const isFailed = latest?.status === 'failed'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {/* ===== 진행중 ===== */}
        {isActive && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[#c96442] bg-[#faf0eb] border border-[#e8d5cc] rounded-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {latest!.status === 'pending'
              ? '⏳ 대기 중 (워커가 곧 처리)'
              : '🔄 발급 중... (예상 30~60초)'}
          </div>
        )}

        {/* ===== 완료 ===== */}
        {isDone && latest!.result_drive_file_url && (
          <>
            <a
              href={latest!.result_drive_file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#065f46] bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg hover:bg-[#d1fae5] transition-colors"
              title="Drive에서 열기"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              발급 완료 · PDF 보기
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
          </>
        )}

        {/* ===== 실패 ===== */}
        {isFailed && (
          <>
            <div
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#b91c1c] bg-[#fef2f2] border border-[#fecaca] rounded-lg max-w-[280px]"
              title={latest!.error_message || ''}
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">실패: {latest!.error_message || '알 수 없는 오류'}</span>
            </div>
            <button
              onClick={requestIssue}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#c96442] border border-[#c96442]/30 rounded-lg hover:bg-[#c96442]/5 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              재시도
            </button>
          </>
        )}

        {/* ===== 초기 (task 없음) ===== */}
        {!latest && (
          <button
            onClick={requestIssue}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#c96442] border border-[#c96442]/30 rounded-lg hover:bg-[#c96442]/5 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            건축물대장 발급
          </button>
        )}

        {/* 이력 토글 */}
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(s => !s)}
            title="발급 이력"
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-primary text-txt-tertiary hover:text-txt-secondary hover:bg-surface-secondary transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            {history.length > 1 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#c96442] text-white text-[8px] rounded-full flex items-center justify-center">
                {history.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* 에러 텍스트 */}
      {error && <p className="text-[10px] text-[#b91c1c]">{error}</p>}

      {/* 디버그 (dev only) */}
      {isDev && latest && (
        <details className="text-[9px] text-txt-quaternary font-mono">
          <summary className="cursor-pointer hover:text-txt-tertiary">debug</summary>
          <div className="mt-1 p-2 bg-surface-secondary rounded space-y-0.5">
            <div>id: {latest.id}</div>
            <div>status: {latest.status}</div>
            <div>created: {new Date(latest.created_at).toLocaleString('ko-KR')}</div>
            <div>updated: {new Date(latest.updated_at).toLocaleString('ko-KR')}</div>
            {latest.done_at && <div>done: {new Date(latest.done_at).toLocaleString('ko-KR')}</div>}
            {latest.result_drive_file_id && <div>drive_id: {latest.result_drive_file_id}</div>}
          </div>
        </details>
      )}

      {/* 이력 패널 */}
      {showHistory && history.length > 0 && (
        <CertificateHistory tasks={history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

// ===== 이력 컴포넌트 =====
function CertificateHistory({ tasks, onClose }: { tasks: CoworkTask[]; onClose: () => void }) {
  return (
    <div className="absolute right-6 top-16 z-30 w-[380px] max-h-[400px] overflow-y-auto bg-surface border border-border-primary rounded-lg shadow-xl">
      <div className="sticky top-0 flex items-center justify-between px-3 py-2 border-b border-border-primary bg-surface">
        <h3 className="text-[12px] font-semibold text-txt-primary">발급 이력 ({tasks.length})</h3>
        <button onClick={onClose} className="text-[11px] text-txt-tertiary hover:text-txt-secondary">
          닫기
        </button>
      </div>
      <div className="divide-y divide-border-tertiary">
        {tasks.map(t => {
          const statusLabel =
            t.status === 'done' ? '✅ 완료'
            : t.status === 'failed' ? '❌ 실패'
            : t.status === 'processing' ? '🔄 발급 중'
            : '⏳ 대기'
          const statusColor =
            t.status === 'done' ? 'text-[#065f46]'
            : t.status === 'failed' ? 'text-[#b91c1c]'
            : 'text-[#c96442]'
          return (
            <div key={t.id} className="px-3 py-2 hover:bg-surface-secondary">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
                <span className="text-[10px] text-txt-tertiary tabular-nums">
                  {new Date(t.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {t.result_drive_file_url && (
                <a
                  href={t.result_drive_file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-[#c96442] hover:underline"
                >
                  PDF 열기 ↗
                </a>
              )}
              {t.error_message && (
                <p className="text-[10px] text-[#b91c1c] mt-0.5 line-clamp-2">{t.error_message}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
