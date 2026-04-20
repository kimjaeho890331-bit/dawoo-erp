'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Payment {
  id: string
  payment_type: string
  amount: number
  payment_date: string | null
  payer_name: string | null
  note: string | null
  created_at: string
}

const PAYMENT_TYPES = ['자부담착수금', '추가공사비', '시지원금잔금'] as const

interface Props {
  projectId: string
  totalCost: number
  additionalCost: number
  onOutstandingChange?: (outstanding: number, collected: number) => void
}

export default function PaymentTable({ projectId, totalCost, additionalCost, onOutstandingChange }: Props) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [showAddRow, setShowAddRow] = useState(false)
  const [newPayment, setNewPayment] = useState({
    payment_type: PAYMENT_TYPES[0] as string,
    amount: '',
    payment_date: '',
    payer_name: '',
  })
  const [saving, setSaving] = useState(false)

  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('project_id', projectId)
      .order('payment_date', { ascending: true })
    setPayments(data || [])
  }, [projectId])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  // Realtime: 텔레그램/AI에서 입금 추가되면 즉시 반영
  useEffect(() => {
    const ch = supabase
      .channel(`payments-${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'payments',
        filter: `project_id=eq.${projectId}`,
      }, () => { loadPayments() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, loadPayments])

  const collected = payments.reduce((sum, p) => sum + p.amount, 0)
  const outstanding = (totalCost + additionalCost) - collected

  // 미수금/수금액 변경 시 부모에 알림
  useEffect(() => {
    onOutstandingChange?.(Math.max(0, outstanding), collected)
  }, [outstanding, collected, onOutstandingChange])

  const handleAdd = async () => {
    if (!newPayment.amount || Number(newPayment.amount) <= 0) return
    setSaving(true)
    try {
      const { error } = await supabase.from('payments').insert({
        project_id: projectId,
        payment_type: newPayment.payment_type,
        amount: Number(newPayment.amount),
        payment_date: newPayment.payment_date || null,
        payer_name: newPayment.payer_name || null,
      })
      if (error) throw error

      // projects 테이블 미수금/수금액 업데이트
      const newCollected = collected + Number(newPayment.amount)
      const newOutstanding = Math.max(0, (totalCost + additionalCost) - newCollected)
      await supabase.from('projects').update({
        outstanding: newOutstanding,
        collected: newCollected,
      }).eq('id', projectId)

      setNewPayment({ payment_type: PAYMENT_TYPES[0], amount: '', payment_date: '', payer_name: '' })
      setShowAddRow(false)
      await loadPayments()
    } catch (err) {
      console.error('입금 추가 실패:', err)
      alert('입금 추가에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (payment: Payment) => {
    try {
      await supabase.from('payments').delete().eq('id', payment.id)

      const newCollected = collected - payment.amount
      const newOutstanding = Math.max(0, (totalCost + additionalCost) - newCollected)
      await supabase.from('projects').update({
        outstanding: newOutstanding,
        collected: newCollected,
      }).eq('id', projectId)

      await loadPayments()
    } catch (err) {
      console.error('삭제 실패:', err)
    }
  }

  return (
    <div>
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-3 p-2.5 bg-surface-secondary rounded-lg text-center">
        <div>
          <p className="text-[10px] text-txt-tertiary">총공사비+추가</p>
          <p className="text-[12px] font-semibold tabular-nums text-txt-primary">{(totalCost + additionalCost).toLocaleString()}원</p>
        </div>
        <div>
          <p className="text-[10px] text-txt-tertiary">수금합계</p>
          <p className="text-[12px] font-semibold tabular-nums text-accent-text">{collected.toLocaleString()}원</p>
        </div>
        <div>
          <p className="text-[10px] text-txt-tertiary">미수금</p>
          <p className={`text-[12px] font-semibold tabular-nums ${outstanding > 0 ? 'text-money-negative' : 'text-txt-secondary'}`}>
            {outstanding.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* 입금 테이블 */}
      <div className="border border-border-primary rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface-secondary border-b border-border-primary">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">유형</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금일</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-txt-secondary">입금자</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-txt-secondary">금액</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && !showAddRow ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-txt-tertiary text-[11px]">
                  입금 내역이 없습니다
                </td>
              </tr>
            ) : (
              payments.map(p => {
                // 확인자 추출 (note에 "by 이름" 포함된 경우)
                const confirmerMatch = p.note?.match(/by ([^\s]+)/)
                const confirmer = confirmerMatch ? confirmerMatch[1] : null
                return (
                <tr key={p.id} className="border-b border-border-tertiary group">
                  <td className="px-3 py-2 text-txt-secondary">{p.payment_type}</td>
                  <td className="px-3 py-2 text-txt-secondary">{p.payment_date || '-'}</td>
                  <td className="px-3 py-2 text-txt-secondary">
                    {p.payer_name || '-'}
                    {confirmer && <span className="text-[10px] text-txt-quaternary ml-1">({confirmer} 확인)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-txt-primary font-medium">{p.amount.toLocaleString()}원</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => handleDelete(p)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-danger-bg text-txt-tertiary hover:text-danger transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              )})
            )}

            {/* 새 입금 입력 행 */}
            {showAddRow && (
              <tr className="border-b border-border-tertiary bg-accent/5">
                <td className="px-2 py-1.5">
                  <select
                    value={newPayment.payment_type}
                    onChange={e => setNewPayment(prev => ({ ...prev, payment_type: e.target.value }))}
                    className="w-full h-[30px] px-1.5 border border-border-primary rounded text-[11px] focus:outline-none focus:border-accent"
                  >
                    {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="date"
                    value={newPayment.payment_date}
                    onChange={e => setNewPayment(prev => ({ ...prev, payment_date: e.target.value }))}
                    className="w-full h-[30px] px-1.5 border border-border-primary rounded text-[11px] focus:outline-none focus:border-accent"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    placeholder="입금자명"
                    value={newPayment.payer_name}
                    onChange={e => setNewPayment(prev => ({ ...prev, payer_name: e.target.value }))}
                    className="w-full h-[30px] px-1.5 border border-border-primary rounded text-[11px] focus:outline-none focus:border-accent"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    placeholder="금액"
                    value={newPayment.amount}
                    onChange={e => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full h-[30px] px-1.5 border border-border-primary rounded text-[11px] text-right focus:outline-none focus:border-accent"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="w-6 h-6 flex items-center justify-center rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Plus size={12} />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-2">
        {!showAddRow && (
          <button
            onClick={() => setShowAddRow(true)}
            className="px-3 py-1.5 text-[11px] text-link border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
          >
            + 입금 추가
          </button>
        )}
        {showAddRow && (
          <button
            onClick={() => setShowAddRow(false)}
            className="px-3 py-1.5 text-[11px] text-txt-tertiary border border-border-primary rounded-lg hover:bg-surface-secondary transition-colors"
          >
            취소
          </button>
        )}
      </div>
    </div>
  )
}
