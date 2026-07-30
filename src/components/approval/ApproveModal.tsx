'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import { EXPENSE_CATEGORIES } from '@/types/approval'

interface Props {
  open: boolean
  title: string
  drafterName: string
  totalAmount: number
  paymentCount: number
  isFinal: boolean
  resumeOnly: boolean
  docNo: string | null
  onClose: () => void
  onDone: () => void
  reportId: string
  /** 지금 이 결재를 누르는 사람. 서버가 요구하는 actor_staff_id로 그대로 전달된다. */
  actorId: string
  actorName: string
}

export default function ApproveModal({
  open, title, drafterName, totalAmount, paymentCount, isFinal, resumeOnly, docNo, onClose, onDone, reportId,
  actorId, actorName,
}: Props) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [category, setCategory] = useState<string>('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setMode('approve')
      setCategory('')
      setComment('')
      setError(null)
    }
  }, [open])

  if (!open) return null

  const submit = async () => {
    if (!actorId) {
      setError('행위자를 선택해 주세요')
      return
    }
    if (mode === 'reject' && !comment.trim()) {
      setError('반려 사유를 입력해 주세요')
      return
    }
    if (mode === 'approve' && isFinal && !category) {
      setError('계정과목을 선택해 주세요')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const url = mode === 'approve' ? '/api/approval/approve' : '/api/approval/reject'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, actor_staff_id: actorId, category: category || undefined, comment }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '처리에 실패했습니다'); return }
      onDone()
    } catch {
      setError('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-md rounded-xl border border-border-primary overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <span className="text-base font-medium">결재하기</span>
          <button onClick={onClose} aria-label="닫기"><X size={17} className="text-txt-tertiary" /></button>
        </div>

        <div className="px-5 py-4">
          <div className="bg-surface-secondary rounded-lg px-3 py-2.5 mb-4">
            <div className="text-xs mb-1">{title}</div>
            <div className="text-xs text-txt-secondary">
              기안 {drafterName} · 지급 총계 {formatMoney(totalAmount)}원 · {paymentCount}건 · 결재자 {actorName}
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setMode('approve')}
              className={`flex-1 py-2 text-sm rounded-lg border ${mode === 'approve' ? 'border-accent border-2' : 'border-border-primary text-txt-secondary'}`}>
              승인
            </button>
            {!resumeOnly && (
              <button onClick={() => setMode('reject')}
                className={`flex-1 py-2 text-sm rounded-lg border ${mode === 'reject' ? 'border-danger border-2' : 'border-border-primary text-txt-secondary'}`}>
                반려
              </button>
            )}
          </div>

          {resumeOnly && (
            <div className="text-xs text-txt-tertiary mb-4 p-2.5 bg-surface-secondary rounded-lg">
              이미 결재가 완료된 문서의 마무리 처리입니다. 반려는 할 수 없습니다.
            </div>
          )}

          {mode === 'approve' && isFinal && (
            <>
              <div className="text-xs text-txt-secondary mb-1.5">계정과목 <span className="text-danger">*</span></div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                aria-label="계정과목"
                className="w-full px-3 py-2 text-sm border border-border-primary rounded-lg mb-1.5">
                <option value="">선택</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-xs text-txt-tertiary mb-4">
                {docNo
                  ? `문서번호 ${docNo}로 지급정보 ${paymentCount}건이 지출관리에 등록됩니다`
                  : `승인하면 문서번호가 부여되고 지급정보 ${paymentCount}건이 지출관리에 등록됩니다`
                }
              </p>
            </>
          )}

          <div className="text-xs text-txt-secondary mb-1.5">
            결재의견 {mode === 'reject' && <span className="text-danger">*</span>}
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            className="w-full h-20 px-3 py-2 text-sm border border-border-primary rounded-lg" />

          {error && <div className="mt-3 text-sm text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} disabled={busy}
            className="px-5 py-2 text-sm border border-border-primary rounded-lg disabled:opacity-40">취소</button>
          <button onClick={submit} disabled={busy}
            className="px-5 py-2 text-sm rounded-lg bg-accent text-txt-inverse disabled:opacity-40">결재</button>
        </div>
      </div>
    </div>
  )
}
