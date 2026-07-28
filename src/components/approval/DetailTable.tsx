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

  const cell = 'w-full px-2 py-1.5 text-xs bg-transparent outline-none'

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-medium">상세 내용</span>
        <div className="flex items-center gap-2">
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

      <table className="w-full table-fixed text-xs">
        <thead className="bg-surface-secondary text-txt-secondary">
          <tr>
            <th className="w-[6%] px-2 py-2"></th>
            <th className="w-[18%] px-2 py-2 text-left font-normal">거래처명</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal">계정</th>
            <th className="w-[22%] px-2 py-2 text-left font-normal">내용</th>
            <th className="w-[13%] px-2 py-2 text-left font-normal">부서명</th>
            <th className="w-[14%] px-2 py-2 text-right font-normal">금액</th>
            <th className="w-[9%] px-2 py-2 text-left font-normal">비고</th>
            <th className="w-[5%] px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-primary bg-accent-light">
            <td className="px-2 text-center text-[11px] text-accent-text">일괄</td>
            <td>
              <select className={cell} value={template.vendor_name}
                onChange={e => setTemplate({ ...template, vendor_name: e.target.value })}>
                <option value="">선택</option>
                {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </td>
            <td><input className={cell} value={template.account}
              onChange={e => setTemplate({ ...template, account: e.target.value })} /></td>
            <td><input className={cell} value={template.content}
              onChange={e => setTemplate({ ...template, content: e.target.value })} /></td>
            <td><input className={cell} value={template.dept_name}
              onChange={e => setTemplate({ ...template, dept_name: e.target.value })} /></td>
            <td><input className={`${cell} text-right`} value={template.amount ? formatMoney(template.amount) : ''}
              onChange={e => setTemplate({ ...template, amount: parseMoney(e.target.value) })} /></td>
            <td><input className={cell} value={template.note}
              onChange={e => setTemplate({ ...template, note: e.target.value })} /></td>
            <td></td>
          </tr>

          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-primary">
              <td className="px-2 text-center">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} aria-label={`${i + 1}행 선택`} />
              </td>
              <td>
                <select className={cell} value={r.vendor_name}
                  onChange={e => set(i, { vendor_name: e.target.value })}>
                  <option value="">선택</option>
                  {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td><input className={cell} value={r.account} onChange={e => set(i, { account: e.target.value })} /></td>
              <td><input className={cell} value={r.content} onChange={e => set(i, { content: e.target.value })} /></td>
              <td><input className={cell} value={r.dept_name} onChange={e => set(i, { dept_name: e.target.value })} /></td>
              <td><input className={`${cell} text-right`} value={r.amount ? formatMoney(r.amount) : ''}
                onChange={e => set(i, { amount: parseMoney(e.target.value) })} /></td>
              <td><input className={cell} value={r.note} onChange={e => set(i, { note: e.target.value })} /></td>
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
