'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  searchWorkTargets,
  selectedWorkTarget,
  WORK_SEARCH_LIMIT,
  WORK_SOURCE_FILTERS,
  type WorkKind,
  type WorkProjectOption,
  type WorkSiteOption,
  type WorkSourceFilter,
  type WorkTargetHit,
} from '@/lib/workTarget'

export type { WorkProjectOption, WorkSiteOption }

export default function WorkTargetPicker({
  kind,
  siteId,
  projectId,
  sites,
  projects,
  onChange,
  compact,
}: {
  kind: WorkKind
  siteId: string
  projectId: string
  sites: WorkSiteOption[]
  projects: WorkProjectOption[]
  onChange: (next: { kind: WorkKind; siteId: string; projectId: string }) => void
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<WorkSourceFilter>('all')
  const [includeCompleted, setIncludeCompleted] = useState(false)

  const selected = useMemo(
    () => selectedWorkTarget({ sites, projects, siteId, projectId }),
    [sites, projects, siteId, projectId],
  )

  const hits = useMemo(
    () => searchWorkTargets({
      sites,
      projects,
      query,
      source,
      includeCompleted,
      selectedSiteId: siteId || null,
    }),
    [sites, projects, query, source, includeCompleted, siteId],
  )

  const pick = (hit: WorkTargetHit) => {
    if (hit.kind === 'site') {
      onChange({ kind: 'site', siteId: hit.id, projectId: '' })
    } else {
      onChange({ kind: 'project', siteId: '', projectId: hit.id })
    }
    setQuery('')
  }

  const clear = () => {
    onChange({ kind: '', siteId: '', projectId: '' })
    setQuery('')
  }

  const chipCls = (active: boolean) =>
    `${compact ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3 text-[13px]'} rounded-lg font-medium border cursor-pointer ${
      active
        ? 'bg-accent-light text-accent border-accent'
        : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
    }`

  const inputCls = compact
    ? 'h-8 w-full rounded-lg border border-border-primary bg-surface pl-8 pr-3 text-xs text-txt-primary'
    : 'input-field w-full pl-9 text-base md:text-[13px]'

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-txt-primary">
            {selected.label}
            <span className="ml-1.5 text-[11px] text-txt-tertiary">
              {selected.sourceLabel}
              {selected.completed ? ' · 정산완료' : ''}
            </span>
          </span>
          <button type="button" onClick={clear} aria-label="현장 선택 해제" className="shrink-0">
            <X size={14} className="text-txt-tertiary" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-txt-tertiary">
          {kind === '' ? '비워 두면 목록에 현장 없음으로 보입니다. 저장은 됩니다.' : '검색해서 현장을 고르세요.'}
        </p>
      )}

      <div className="relative">
        <Search
          size={14}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-txt-tertiary ${compact ? 'left-2.5' : 'left-3'}`}
        />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="현장·접수 이름 검색"
          aria-label="현장 검색"
          autoComplete="off"
          className={inputCls}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {WORK_SOURCE_FILTERS.map(opt => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={source === opt.key}
            onClick={() => setSource(opt.key)}
            className={chipCls(source === opt.key)}
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

      {query.trim() ? (
        <div
          role="listbox"
          aria-label="현장 검색 결과"
          className="max-h-52 overflow-y-auto rounded-lg border border-border-primary bg-surface"
        >
          {hits.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-txt-tertiary">검색 결과가 없습니다</div>
          ) : (
            hits.map(hit => {
              const active = hit.kind === 'site' ? hit.id === siteId : hit.id === projectId
              return (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(hit)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-border-primary px-3 py-2.5 text-left last:border-0 ${
                    active ? 'bg-accent-light' : 'hover:bg-surface-secondary'
                  }`}
                >
                  <span className={`min-w-0 truncate ${compact ? 'text-xs' : 'text-[13px]'} text-txt-primary`}>
                    {hit.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-txt-tertiary">
                    {hit.sourceLabel}
                    {hit.completed ? ' · 정산완료' : ''}
                  </span>
                </button>
              )
            })
          )}
          {hits.length === WORK_SEARCH_LIMIT && (
            <div className="px-3 py-2 text-[11px] text-txt-tertiary">상위 20건입니다. 검색어를 더 넣어 주세요.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
