'use client'

import { useEffect, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { supabase } from '@/lib/supabase'
import { EMPTY_PAYMENT, type PaymentRow } from '@/types/approval'
import VendorNameCell, { type VendorOption } from './VendorNameCell'

interface Props {
  rows: PaymentRow[]
  onChange: (rows: PaymentRow[]) => void
}

export default function PaymentTable({ rows, onChange }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  // 거래처DB 후보 목록. 조회 전용 — vendors 테이블에는 쓰지 않는다.
  const [vendors, setVendors] = useState<VendorOption[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vendors')
      .select('id, name, business_number, bank_name, account_number, bank_info')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setVendors((data ?? []) as VendorOption[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const set = (i: number, patch: Partial<PaymentRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none rounded hover:bg-surface-secondary focus:bg-surface focus:ring-1 focus:ring-accent'

  // 모바일 입력칸. 글자를 16px로 두는 이유는 아이폰 사파리가 그보다 작은 입력칸을 누르면
  // 화면을 자동 확대해버리기 때문이다. 높이 44px는 손가락에 맞춘 최소 크기다.
  const mCell =
    'w-full h-11 px-3 text-base bg-surface border border-border-primary rounded-lg outline-none focus:ring-1 focus:ring-accent text-txt-primary'
  const mLabel = 'block mb-1 text-xs text-txt-secondary'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-border-primary">
        <span className="text-xs text-txt-secondary">지급 총계(원)</span>
        <span className="text-lg font-medium">{formatMoney(total)}</span>
        <span className="hidden md:inline text-xs text-txt-tertiary">지급 정보 합계 자동계산</span>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">지급 정보</span>
        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="hidden md:flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded"
        >
          <Plus size={12} /> 추가
        </button>
      </div>

      {/* 모바일 — 한 건이 카드 한 장. 7칸 표를 폰에 그리면 칸마다 40px도 안 남는다. */}
      <div className="md:hidden px-3 py-3">
        {rows.map((r, i) => (
          <div key={i} className="border border-border-primary rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-txt-secondary">{i + 1}번째 지급 건</span>
              <button
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label={`${i + 1}번째 지급 건 삭제`}
                className="-mr-2 -mt-1 w-11 h-11 flex items-center justify-center"
              >
                <Trash2 size={18} className="text-txt-tertiary" />
              </button>
            </div>

            <label className={mLabel}>거래처명 *</label>
            <div className="mb-2.5">
              <VendorNameCell
                value={r.vendor_name}
                vendors={vendors}
                onInput={v => set(i, { vendor_name: v })}
                onSelect={patch => set(i, patch)}
                className={mCell}
                placeholder="거래처명"
              />
            </div>

            <label className={mLabel}>지급금액 *</label>
            <input
              className={`${mCell} text-right mb-2.5`}
              inputMode="numeric"
              value={r.amount ? formatMoney(r.amount) : ''}
              onChange={e => set(i, { amount: parseMoney(e.target.value) })}
              placeholder="0"
            />

            <label className={mLabel}>지급요청일 *</label>
            <input
              className={`${mCell} mb-2.5`}
              type="date"
              value={r.pay_request_date}
              onChange={e => set(i, { pay_request_date: e.target.value })}
            />

            <div className="flex gap-2 mb-2.5">
              <div className="flex-1 min-w-0">
                <label className={mLabel}>은행 *</label>
                <input className={mCell} value={r.bank} onChange={e => set(i, { bank: e.target.value })} placeholder="은행명" />
              </div>
              <div className="flex-[1.4] min-w-0">
                <label className={mLabel}>계좌번호 *</label>
                <input
                  className={mCell}
                  inputMode="numeric"
                  value={r.account_no}
                  onChange={e => set(i, { account_no: e.target.value })}
                  placeholder="계좌번호"
                />
              </div>
            </div>

            <label className={mLabel}>사업자번호</label>
            <input
              className={mCell}
              inputMode="numeric"
              value={r.business_no}
              onChange={e => set(i, { business_no: e.target.value })}
              placeholder="선택"
            />
          </div>
        ))}

        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="w-full h-11 flex items-center justify-center gap-1.5 text-sm text-txt-secondary border border-dashed border-border-primary rounded-lg"
        >
          <Plus size={16} /> 지급 건 추가
        </button>
      </div>

      <table className="hidden md:table w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[17%] px-2 py-2 text-left font-normal border-r border-border-primary">거래처명 *</th>
            <th className="w-[15%] px-2 py-2 text-right font-normal border-r border-border-primary">지급금액 *</th>
            <th className="w-[14%] px-2 py-2 text-left font-normal border-r border-border-primary">지급요청일 *</th>
            <th className="w-[12%] px-2 py-2 text-left font-normal border-r border-border-primary">은행 *</th>
            <th className="w-[20%] px-2 py-2 text-left font-normal border-r border-border-primary">계좌번호 *</th>
            <th className="w-[16%] px-2 py-2 text-left font-normal border-r border-border-primary">사업자번호</th>
            <th className="w-[6%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td className="border-r border-border-primary">
                <VendorNameCell
                  value={r.vendor_name}
                  vendors={vendors}
                  onInput={v => set(i, { vendor_name: v })}
                  onSelect={patch => set(i, patch)}
                  className={cell}
                  placeholder="거래처명"
                />
              </td>
              <td className="border-r border-border-primary"><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} placeholder="0" /></td>
              <td className="border-r border-border-primary"><input className={cell} type="date" value={r.pay_request_date}
                onChange={e => set(i, { pay_request_date: e.target.value })} /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.bank}
                onChange={e => set(i, { bank: e.target.value })} placeholder="은행명" /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.account_no}
                onChange={e => set(i, { account_no: e.target.value })} placeholder="계좌번호" /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.business_no}
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
