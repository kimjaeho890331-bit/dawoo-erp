'use client'

import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { EMPTY_PAYMENT, type PaymentRow } from '@/types/approval'

interface Props {
  rows: PaymentRow[]
  onChange: (rows: PaymentRow[]) => void
}

export default function PaymentTable({ rows, onChange }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  const set = (i: number, patch: Partial<PaymentRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
        <span className="text-xs text-txt-secondary">지급 총계(원)</span>
        <span className="text-lg font-medium">{formatMoney(total)}</span>
        <span className="text-xs text-txt-tertiary">지급 정보 합계 자동계산</span>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">지급 정보</span>
        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded"
        >
          <Plus size={12} /> 추가
        </button>
      </div>

      <table className="w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[17%] px-2 py-2 text-left font-normal">거래처명 *</th>
            <th className="w-[15%] px-2 py-2 text-right font-normal">지급금액 *</th>
            <th className="w-[14%] px-2 py-2 text-left font-normal">지급요청일 *</th>
            <th className="w-[12%] px-2 py-2 text-left font-normal">은행 *</th>
            <th className="w-[20%] px-2 py-2 text-left font-normal">계좌번호 *</th>
            <th className="w-[16%] px-2 py-2 text-left font-normal">사업자번호</th>
            <th className="w-[6%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td><input className={cell} value={r.vendor_name}
                onChange={e => set(i, { vendor_name: e.target.value })} placeholder="거래처명" /></td>
              <td><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} placeholder="0" /></td>
              <td><input className={cell} type="date" value={r.pay_request_date}
                onChange={e => set(i, { pay_request_date: e.target.value })} /></td>
              <td><input className={cell} value={r.bank}
                onChange={e => set(i, { bank: e.target.value })} placeholder="은행명" /></td>
              <td><input className={cell} value={r.account_no}
                onChange={e => set(i, { account_no: e.target.value })} placeholder="계좌번호" /></td>
              <td><input className={cell} value={r.business_no}
                onChange={e => set(i, { business_no: e.target.value })} placeholder="선택" /></td>
              <td className="text-center">
                <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="행 삭제">
                  <Trash2 size={13} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={7} className="px-2 py-4 text-txt-tertiary">추가를 눌러 지급 정보를 입력하세요</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
