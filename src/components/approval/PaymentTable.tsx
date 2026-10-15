'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { supabase } from '@/lib/supabase'
import { EMPTY_PAYMENT, type PaymentRow } from '@/types/approval'
import VendorNameCell, { type VendorOption } from './VendorNameCell'
import { BTN_SECONDARY } from './ui'

interface Props {
  rows: PaymentRow[]
  onChange: (rows: PaymentRow[]) => void
  onPickVendor?: (vendor: VendorOption) => void
  /** 지급 총계 줄 오른쪽에 놓을 것들(엑셀 양식·업로드). 업로드 로직은 부모가 갖고 있다. */
  actions?: React.ReactNode
}

export default function PaymentTable({ rows, onChange, onPickVendor, actions }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  // 거래처DB 후보 목록. 조회 전용 — vendors 테이블에는 쓰지 않는다.
  const [vendors, setVendors] = useState<VendorOption[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vendors')
      .select('id, name, business_number, bank_name, account_number, bank_info, biz_license_url, bankbook_url')
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

  const cell = 'w-full px-3 py-2 text-[13px] bg-transparent outline-none rounded hover:bg-surface-secondary focus:bg-surface focus:ring-1 focus:ring-accent'

  // 모바일 입력칸. 글자를 16px로 두는 이유는 아이폰 사파리가 그보다 작은 입력칸을 누르면
  // 화면을 자동 확대해버리기 때문이다. 높이 44px는 손가락에 맞춘 최소 크기다.
  const mCell =
    'w-full h-11 px-3 text-base bg-surface border border-border-primary rounded-lg outline-none focus:ring-1 focus:ring-accent text-txt-primary'
  const mLabel = 'mb-1.5 block text-label'

  // 줄마다 공사건이 붙을 수 있다(029). 공사건이 둘 이상이면 묶음 머리줄을 끼워
  // 어느 공사건의 지급인지 보이게 하고, 묶음별 소계와 총 합계를 함께 보여준다.
  // 공사건이 없거나 하나뿐인 일반 결의서는 예전 그대로 한 덩어리로 그린다.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; idxs: number[]; total: number }>()
    rows.forEach((r, i) => {
      const key = r.site_id ? `site:${r.site_id}` : r.project_id ? `project:${r.project_id}` : 'none'
      let g = map.get(key)
      if (!g) {
        g = { key, label: r.work_target_label || (key === 'none' ? '공사건 없음' : '공사건'), idxs: [], total: 0 }
        map.set(key, g)
      }
      g.idxs.push(i)
      g.total += r.amount || 0
    })
    return [...map.values()]
  }, [rows])
  const grouped = groups.length > 1

  const mobileCard = (i: number) => {
    const r = rows[i]
    return (

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
                vendors={vendors}
                onInput={v => set(i, { vendor_name: v })}
                onSelect={patch => set(i, patch)}
                onPickVendor={onPickVendor}
                className={mCell}
                placeholder="거래처명"
              />
            </div>

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

            <label className={mLabel}>사업자번호</label>
            <input
              className={mCell}
              inputMode="numeric"
              value={r.business_no}
              onChange={e => set(i, { business_no: e.target.value })}
              placeholder="선택"
            />
          </div>
    )
  }

  const desktopRow = (i: number) => {
    const r = rows[i]
    return (

            <tr key={i} className="border-t border-border-primary">
              <td className="border-r border-border-primary">
                <VendorNameCell
                  value={r.vendor_name}
                  vendors={vendors}
                  onInput={v => set(i, { vendor_name: v })}
                  onSelect={patch => set(i, patch)}
                  onPickVendor={onPickVendor}
                  className={cell}
                  placeholder="거래처명"
                />
              </td>
              <td className="border-r border-border-primary"><input className={`${cell} text-money text-right`} value={r.amount ? formatMoney(r.amount) : ''}
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
                <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="행 삭제"
                  className="inline-flex h-9 w-9 items-center justify-center">
                  <Trash2 size={14} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-primary bg-surface">
      {/*
        머리줄 하나에 합계와 버튼을 모은다. 예전에는 "지급 총계" 줄과 "지급 정보 · 추가" 줄이
        따로 있었는데, 구역 제목이 이미 위에 있어 두 줄이 같은 말을 했다.
        폰에서는 버튼이 한 줄에 다 들어가지 않으므로 넘치면 아래로 접는다.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-primary px-4 py-3 md:px-5">
        <span className="text-label">{grouped ? '총 합계' : '합계'}</span>
        <span className="text-money text-[15px]">{formatMoney(total)}원</span>
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          {actions}
          {/* 폰은 카드 목록 아래에 "지급 건 추가"가 따로 있다. 버튼 모양 클래스에 inline-flex가
              들어 있어 hidden과 한 요소에 같이 쓰면 숨겨지지 않으므로 감싸서 숨긴다. */}
          <div className="hidden md:block">
            <button onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])} className={BTN_SECONDARY}>
              <Plus size={14} className="text-txt-tertiary" /> 줄 추가
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 — 한 건이 카드 한 장. 7칸 표를 폰에 그리면 칸마다 40px도 안 남는다. */}
      <div className="px-4 py-4 md:hidden">
        {grouped
          ? groups.map(g => (
              <div key={g.key} className="mb-4">
                <div className="mb-2 flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2">
                  <b className="text-[13px] text-txt-primary">{g.label}</b>
                  <span className="text-[12px] text-txt-tertiary">
                    {g.idxs.length}건 · <span className="text-money">{formatMoney(g.total)}</span>원
                  </span>
                </div>
                {g.idxs.map(i => mobileCard(i))}
              </div>
            ))
          : rows.map((_, i) => mobileCard(i))}

        <button
          onClick={() => onChange([...rows, { ...EMPTY_PAYMENT }])}
          className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-primary text-[13px] text-txt-secondary"
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
            <th className="w-[16%] border-r border-border-primary px-3 py-3 text-left">사업자번호</th>
            <th className="w-[6%] px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {grouped
            ? groups.map(g => (
                <Fragment key={g.key}>
                  <tr className="border-t border-border-primary bg-surface-secondary">
                    <td colSpan={7} className="px-3 py-2 text-[13px]">
                      <b className="text-txt-primary">{g.label}</b>
                      <span className="ml-2 text-txt-tertiary">
                        {g.idxs.length}건 · <span className="text-money">{formatMoney(g.total)}</span>원
                      </span>
                    </td>
                  </tr>
                  {g.idxs.map(i => desktopRow(i))}
                </Fragment>
              ))
            : rows.map((_, i) => desktopRow(i))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={7} className="px-4 py-8 text-txt-tertiary">&lsquo;줄 추가&rsquo;를 눌러 지급 정보를 적어 주세요</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
