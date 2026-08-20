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
  onVendorPick?: (vendor: VendorOption) => void
}

export default function PaymentTable({ rows, onChange, onVendorPick }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [dailyOnly, setDailyOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vendors')
      .select('id, name, vendor_type, business_number, bank_name, account_number, bank_info, phone, resident_id, id_card_url, bankbook_url, safety_cert_url')
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

  const listedVendors = dailyOnly ? vendors.filter(v => v.vendor_type === '일용직') : vendors

  const isDailyRow = (r: PaymentRow) =>
    r.vendor_type === '일용직' || vendors.find(v => v.name === r.vendor_name)?.vendor_type === '일용직'

  const cell = 'w-full px-3 py-2 text-[13px] bg-transparent outline-none rounded hover:bg-surface-secondary focus:bg-surface focus:ring-1 focus:ring-accent'
  const mCell =
    'w-full h-11 px-3 text-base bg-surface border border-border-primary rounded-lg outline-none focus:ring-1 focus:ring-accent text-txt-primary'
  const mLabel = 'mb-1.5 block text-label'

  const pickVendor = (i: number, patch: Partial<PaymentRow>) => {
    set(i, patch)
    const v = patch.vendor_id ? vendors.find(x => x.id === patch.vendor_id) : undefined
    if (v) onVendorPick?.(v)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-primary bg-surface">
      <div className="flex items-center gap-3 border-b border-border-primary px-5 py-4">
        <span className="text-label">지급 총계(원)</span>
        <span className="text-money text-[15px]">{formatMoney(total)}</span>
        <span className="hidden text-[12px] text-txt-tertiary md:inline">지급 정보 합계 자동계산</span>
      </div>

      <div className="flex items-center justify-between border-b border-border-primary px-5 py-3">
        <span className="text-card-title">지급 정보</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDailyOnly(v => !v)}
            className={`h-8 rounded-lg border px-3 text-[13px] ${
              dailyOnly
                ? 'border-accent bg-accent-light text-accent-text'
                : 'border-border-primary text-txt-secondary'
            }`}
          >
            일용직만
          </button>
          <button
            onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
            className="hidden h-8 items-center gap-1 rounded-lg border border-border-primary px-3 text-[13px] md:flex"
          >
            <Plus size={14} className="text-txt-tertiary" /> 추가
          </button>
        </div>
      </div>

      <div className="px-4 py-4 md:hidden">
        {rows.map((r, i) => (
          <div key={i} className="mb-4 rounded-lg border border-border-primary bg-surface px-5 py-4 last:mb-0">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-label">{i + 1}번째 지급 건</span>
              <button
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label={`${i + 1}번째 지급 건 삭제`}
                className="-mr-2 -mt-1 w-11 h-11 flex items-center justify-center"
              >
                <Trash2 size={18} className="text-txt-tertiary" />
              </button>
            </div>

            <label className={mLabel}>거래처명 *</label>
            <div className="mb-3">
              <VendorNameCell
                value={r.vendor_name}
                vendors={listedVendors}
                onInput={v => set(i, { vendor_name: v, vendor_type: '', vendor_id: '', phone: '', resident_id: '' })}
                onSelect={patch => pickVendor(i, patch)}
                className={mCell}
                placeholder={dailyOnly ? '일용직 이름' : '거래처명'}
              />
            </div>

            {isDailyRow(r) && (
              <>
                <label className={mLabel}>주민번호</label>
                <input
                  className={`${mCell} mb-3`}
                  value={r.resident_id || r.business_no}
                  onChange={e => set(i, { resident_id: e.target.value, business_no: e.target.value })}
                  placeholder="주민번호"
                />
                <label className={mLabel}>연락처</label>
                <input
                  className={`${mCell} mb-3`}
                  value={r.phone ?? ''}
                  onChange={e => set(i, { phone: e.target.value })}
                  placeholder="연락처"
                />
              </>
            )}

            <label className={mLabel}>지급금액 *</label>
            <input
              className={`${mCell} mb-3 text-right`}
              inputMode="numeric"
              value={r.amount ? formatMoney(r.amount) : ''}
              onChange={e => set(i, { amount: parseMoney(e.target.value) })}
              placeholder="0"
            />

            <label className={mLabel}>지급요청일 *</label>
            <input
              className={`${mCell} mb-3`}
              type="date"
              value={r.pay_request_date}
              onChange={e => set(i, { pay_request_date: e.target.value })}
            />

            <div className="mb-3 flex gap-3">
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

            {!isDailyRow(r) && (
              <>
                <label className={mLabel}>사업자번호</label>
                <input
                  className={mCell}
                  inputMode="numeric"
                  value={r.business_no}
                  onChange={e => set(i, { business_no: e.target.value })}
                  placeholder="선택"
                />
              </>
            )}
          </div>
        ))}

        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-primary text-sm text-txt-secondary"
        >
          <Plus size={16} className="text-txt-tertiary" /> 지급 건 추가
        </button>
      </div>

      <table className="hidden w-full table-fixed md:table">
        <thead>
          <tr>
            <th className="w-[17%] border-r border-border-primary px-3 py-3 text-left">거래처명 *</th>
            <th className="w-[15%] border-r border-border-primary px-3 py-3 text-right">지급금액 *</th>
            <th className="w-[14%] border-r border-border-primary px-3 py-3 text-left">지급요청일 *</th>
            <th className="w-[12%] border-r border-border-primary px-3 py-3 text-left">은행 *</th>
            <th className="w-[20%] border-r border-border-primary px-3 py-3 text-left">계좌번호 *</th>
            <th className="w-[16%] border-r border-border-primary px-3 py-3 text-left">사업자·주민번호</th>
            <th className="w-[6%] px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td className="border-r border-border-primary">
                <VendorNameCell
                  value={r.vendor_name}
                  vendors={listedVendors}
                  onInput={v => set(i, { vendor_name: v, vendor_type: '', vendor_id: '', phone: '', resident_id: '' })}
                  onSelect={patch => pickVendor(i, patch)}
                  className={cell}
                  placeholder={dailyOnly ? '일용직 이름' : '거래처명'}
                />
                {isDailyRow(r) && (
                  <input
                    className={cell}
                    value={r.phone ?? ''}
                    onChange={e => set(i, { phone: e.target.value })}
                    placeholder="연락처"
                    aria-label="연락처"
                  />
                )}
              </td>
              <td className="border-r border-border-primary"><input className={`${cell} text-money text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} placeholder="0" /></td>
              <td className="border-r border-border-primary"><input className={cell} type="date" value={r.pay_request_date}
                onChange={e => set(i, { pay_request_date: e.target.value })} /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.bank}
                onChange={e => set(i, { bank: e.target.value })} placeholder="은행명" /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.account_no}
                onChange={e => set(i, { account_no: e.target.value })} placeholder="계좌번호" /></td>
              <td className="border-r border-border-primary"><input className={cell}
                value={isDailyRow(r) ? (r.resident_id || r.business_no) : r.business_no}
                onChange={e => set(i, isDailyRow(r)
                  ? { resident_id: e.target.value, business_no: e.target.value }
                  : { business_no: e.target.value })}
                placeholder={isDailyRow(r) ? '주민번호' : '선택'} /></td>
              <td className="text-center">
                <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="행 삭제"
                  className="inline-flex h-9 w-9 items-center justify-center">
                  <Trash2 size={14} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={7} className="px-4 py-8 text-txt-tertiary">추가를 눌러 지급 정보를 입력하세요</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
