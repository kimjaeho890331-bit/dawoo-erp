'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import {
  buildSettlementGroups,
  expensesForGroup,
  filterSettlementGroups,
  settlementTotals,
  type SettlementExpense,
  type SettlementGroup,
} from '@/lib/expenseSettlement'
import {
  WORK_SOURCE_FILTERS,
  type WorkProjectOption,
  type WorkSiteOption,
  type WorkSourceFilter,
} from '@/lib/workTarget'

export default function SettlementTab({
  expenses,
  sites,
  projects,
  staffName,
}: {
  expenses: SettlementExpense[]
  sites: WorkSiteOption[]
  projects: WorkProjectOption[]
  staffName: (id: string | null) => string
}) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<WorkSourceFilter>('all')
  const [includeCompleted, setIncludeCompleted] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const groups = useMemo(
    () => buildSettlementGroups({ expenses, sites, projects }),
    [expenses, sites, projects],
  )
  const visible = useMemo(
    () => filterSettlementGroups(groups, { query, source, includeCompleted }),
    [groups, query, source, includeCompleted],
  )
  const totals = useMemo(() => settlementTotals(visible), [visible])

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-txt-tertiary">
        지출결의서에 등록된 금액만 현장·지원사업별로 합산합니다.
      </p>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="현장·접수 이름 검색"
          aria-label="정산 대상 검색"
          className="input-field w-full pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {WORK_SOURCE_FILTERS.map(opt => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={source === opt.key}
            onClick={() => setSource(opt.key)}
            className={`h-9 rounded-lg border px-3 text-[13px] font-medium ${
              source === opt.key
                ? 'border-accent bg-accent-light text-accent'
                : 'border-border-primary bg-surface text-txt-secondary hover:bg-surface-tertiary'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-txt-secondary">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={e => setIncludeCompleted(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border-secondary"
          />
          완료 포함
        </label>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border-primary bg-surface">
        {visible.length === 0 ? (
          <div className="py-12 text-center text-sm text-txt-quaternary">합산할 지출이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-border-primary bg-surface-secondary">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">현장</th>
                  <th className="w-[120px] px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">출처</th>
                  <th className="w-[72px] px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">건수</th>
                  <th className="w-[160px] px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.3px] text-txt-tertiary">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-secondary">
                {visible.map(g => (
                  <SettlementRow
                    key={g.key}
                    group={g}
                    open={openKey === g.key}
                    expenses={openKey === g.key ? expensesForGroup(expenses, g) : []}
                    staffName={staffName}
                    onToggle={() => setOpenKey(prev => prev === g.key ? null : g.key)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border-primary bg-surface-secondary px-4 py-3 text-sm">
          <span className="text-txt-secondary">표시 합계 · {totals.count}건</span>
          <span className="text-money text-[15px] text-txt-primary">{formatMoney(totals.total) || '0'}원</span>
        </div>
      </div>
    </div>
  )
}

function SettlementRow({
  group,
  open,
  expenses,
  staffName,
  onToggle,
}: {
  group: SettlementGroup
  open: boolean
  expenses: SettlementExpense[]
  staffName: (id: string | null) => string
  onToggle: () => void
}) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-surface-tertiary" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronDown
              size={14}
              className={`shrink-0 text-txt-tertiary transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
            />
            <span className="text-[13px] text-txt-primary">{group.name}</span>
            {group.completed && <span className="text-[11px] text-txt-tertiary">정산완료</span>}
          </div>
        </td>
        <td className="px-3 py-3 text-[13px] text-txt-secondary">{group.sourceLabel}</td>
        <td className="px-3 py-3 text-right text-[13px] tabular-nums text-txt-secondary">{group.count}</td>
        <td className="px-4 py-3 text-right text-[13px] font-medium tabular-nums text-txt-primary">
          {formatMoney(group.total) || '0'}원
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-surface-secondary px-4 py-3">
            {expenses.length === 0 ? (
              <div className="text-[13px] text-txt-tertiary">내역이 없습니다</div>
            ) : (
              <div className="space-y-2">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-start justify-between gap-4 rounded-lg bg-surface px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[13px] text-txt-primary">{e.title || '제목 없음'}</div>
                      <div className="mt-0.5 text-[11px] text-txt-tertiary">
                        {[e.expense_date, e.category, staffName(e.staff_id ?? null)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-txt-primary">
                      {formatMoney(e.amount || 0) || '0'}원
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
