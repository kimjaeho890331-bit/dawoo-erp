'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { formatMoney, parseMoney } from '@/lib/utils/format'
import { EMPTY_DETAIL, type DetailRow } from '@/types/approval'

interface Props {
  rows: DetailRow[]
  vendors: string[]
  onChange: (rows: DetailRow[]) => void
}

export default function DetailTable({ rows, vendors, onChange }: Props) {
  const [template, setTemplate] = useState<DetailRow>({ ...EMPTY_DETAIL })
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const vendorOptions = [...new Set(vendors)]

  const set = (i: number, patch: Partial<DetailRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setChecked(next)
  }

  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i))
    setChecked(prev => {
      const next = new Set<number>()
      prev.forEach(idx => {
        if (idx < i) next.add(idx)
        else if (idx > i) next.add(idx - 1)
      })
      return next
    })
  }

  const applyTemplate = () => {
    onChange(rows.map((r, i) => (checked.has(i) ? { ...template } : r)))
    setChecked(new Set())
  }

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none rounded hover:bg-surface-secondary focus:bg-surface focus:ring-1 focus:ring-accent'

  // 모바일 입력칸 — 아이폰 자동 확대를 막으려 16px, 손가락에 맞춰 44px.
  const mCell =
    'w-full h-11 px-3 text-base bg-surface border border-border-primary rounded-lg outline-none focus:ring-1 focus:ring-accent text-txt-primary'
  const mLabel = 'block mb-1 text-xs text-txt-secondary'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">상세 내용</span>
        {/*
          일괄 적용은 데스크톱에만 둔다. 첫 행에 값을 넣고 체크한 행에 복사하는 방식이라
          체크박스 열과 템플릿 행이 함께 있어야 뜻이 통하는데, 폰에서 카드마다 체크박스를
          붙이면 무엇에 적용되는지 알기 어렵다. 폰에서는 보통 한두 건만 넣는다.
        */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-txt-tertiary">
            첫 행에 값을 넣고 적용할 행을 체크한 뒤 일괄 적용 — 첫 행은 저장되지 않습니다
          </span>
          <button onClick={applyTemplate} disabled={checked.size === 0}
            className="px-2.5 py-1 text-xs border border-border-primary rounded disabled:opacity-40">일괄 적용</button>
          <button onClick={() => onChange([...rows, { ...EMPTY_DETAIL }])}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded">
            <Plus size={12} /> 추가
          </button>
        </div>
      </div>

      {/* 모바일 — 한 건이 카드 한 장 */}
      <div className="md:hidden px-3 py-3">
        {rows.map((r, i) => (
          <div key={i} className="border border-border-primary rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-txt-secondary">{i + 1}번째</span>
              <button
                onClick={() => removeRow(i)}
                aria-label={`${i + 1}번째 상세 내용 삭제`}
                className="-mr-2 -mt-1 w-11 h-11 flex items-center justify-center"
              >
                <Trash2 size={18} className="text-txt-tertiary" />
              </button>
            </div>

            <label className={mLabel}>거래처명</label>
            <select className={`${mCell} mb-2.5`} value={r.vendor_name} onChange={e => set(i, { vendor_name: e.target.value })}>
              <option value="">선택</option>
              {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>

            <label className={mLabel}>내용</label>
            <input className={`${mCell} mb-2.5`} value={r.content} onChange={e => set(i, { content: e.target.value })} />

            <div className="flex gap-2 mb-2.5">
              <div className="flex-1 min-w-0">
                <label className={mLabel}>계정</label>
                <input className={mCell} value={r.account} onChange={e => set(i, { account: e.target.value })} />
              </div>
              <div className="flex-1 min-w-0">
                <label className={mLabel}>금액</label>
                <input
                  className={`${mCell} text-right`}
                  inputMode="numeric"
                  value={r.amount ? formatMoney(r.amount) : ''}
                  onChange={e => set(i, { amount: parseMoney(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className={mLabel}>부서명</label>
                <input className={mCell} value={r.dept_name} onChange={e => set(i, { dept_name: e.target.value })} />
              </div>
              <div className="flex-1 min-w-0">
                <label className={mLabel}>비고</label>
                <input className={mCell} value={r.note} onChange={e => set(i, { note: e.target.value })} />
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="mb-3 text-xs text-txt-tertiary">비워두고 상신해도 됩니다</p>
        )}

        <button
          onClick={() => onChange([...rows, { ...EMPTY_DETAIL }])}
          className="w-full h-11 flex items-center justify-center gap-1.5 text-sm text-txt-secondary border border-dashed border-border-primary rounded-lg"
        >
          <Plus size={16} /> 상세 내용 추가
        </button>
      </div>

      <table className="hidden md:table w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[6%] px-2 py-2 border-r border-border-primary"></th>
            <th className="w-[18%] px-2 py-2 text-left font-normal border-r border-border-primary">거래처명</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal border-r border-border-primary">계정</th>
            <th className="w-[22%] px-2 py-2 text-left font-normal border-r border-border-primary">내용</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal border-r border-border-primary">부서명</th>
            <th className="w-[14%] px-2 py-2 text-right font-normal border-r border-border-primary">금액</th>
            <th className="w-[9%] px-2 py-2 text-left font-normal border-r border-border-primary">비고</th>
            <th className="w-[5%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-primary bg-accent-light">
            <td className="px-2 text-center text-[11px] text-accent-text border-r border-border-primary">일괄</td>
            <td className="border-r border-border-primary">
              <select className={cell} value={template.vendor_name}
                onChange={e => setTemplate({ ...template, vendor_name: e.target.value })}>
                <option value="">선택</option>
                {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </td>
            <td className="border-r border-border-primary"><input className={cell} value={template.account}
              onChange={e => setTemplate({ ...template, account: e.target.value })} /></td>
            <td className="border-r border-border-primary"><input className={cell} value={template.content}
              onChange={e => setTemplate({ ...template, content: e.target.value })} /></td>
            <td className="border-r border-border-primary"><input className={cell} value={template.dept_name}
              onChange={e => setTemplate({ ...template, dept_name: e.target.value })} /></td>
            <td className="border-r border-border-primary"><input className={`${cell} text-right`} value={template.amount ? formatMoney(template.amount) : ''}
              onChange={e => setTemplate({ ...template, amount: parseMoney(e.target.value) })} /></td>
            <td className="border-r border-border-primary"><input className={cell} value={template.note}
              onChange={e => setTemplate({ ...template, note: e.target.value })} /></td>
            <td></td>
          </tr>

          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td className="px-2 text-center border-r border-border-primary">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} aria-label={`${i + 1}행 선택`} />
              </td>
              <td className="border-r border-border-primary">
                <select className={cell} value={r.vendor_name}
                  onChange={e => set(i, { vendor_name: e.target.value })}>
                  <option value="">선택</option>
                  {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td className="border-r border-border-primary"><input className={cell} value={r.account} onChange={e => set(i, { account: e.target.value })} /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.content} onChange={e => set(i, { content: e.target.value })} /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.dept_name} onChange={e => set(i, { dept_name: e.target.value })} /></td>
              <td className="border-r border-border-primary"><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} /></td>
              <td className="border-r border-border-primary"><input className={cell} value={r.note} onChange={e => set(i, { note: e.target.value })} /></td>
              <td className="text-center">
                <button onClick={() => removeRow(i)} aria-label="행 삭제">
                  <Trash2 size={13} className="text-txt-tertiary" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-primary">
              <td colSpan={8} className="px-2 py-4 text-txt-tertiary">비워두고 상신해도 됩니다</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
