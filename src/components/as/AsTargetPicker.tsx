'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/fetchAllPages'
import {
  AS_TARGET_LIMIT,
  AS_YEAR_ALL,
  asProjectHits,
  asProjectYears,
  asSiteHits,
  isProjectCategory,
  type AsCategory,
  type AsProjectOption,
  type AsSiteOption,
  type AsTargetHit,
  type AsTargetPick,
} from '@/lib/as/target'

/**
 * A/S 접수에서 현장을 고르는 칸.
 *
 * 구분에 따라 찾는 곳이 다르다 — 입찰·수의계약은 현장관리, 수도·소규모는 접수대장.
 * 고르면 아래 현장명·주소 칸이 채워지고, 그 칸은 그대로 손으로 고칠 수 있다
 * (목록에 없는 현장도 접수할 수 있어야 하므로).
 *
 * 목록은 처음 쓸 때 한 번만 읽고 모듈에 들고 있는다. A/S 접수는 한 번 열면
 * 구분을 이리저리 바꿔 보게 되는데, 그때마다 500건을 다시 읽을 이유가 없다.
 */

let siteCache: AsSiteOption[] | null = null
const projectCache = new Map<string, AsProjectOption[]>()

async function loadSites(): Promise<AsSiteOption[]> {
  if (siteCache) return siteCache
  const { data, error } = await supabase
    .from('sites')
    .select('id, name, address, contract_type')
    .order('name')
  if (error) throw error
  siteCache = (data ?? []) as AsSiteOption[]
  return siteCache
}

async function loadProjects(category: '수도' | '소규모'): Promise<AsProjectOption[]> {
  const cached = projectCache.get(category)
  if (cached) return cached

  // 수도/소규모는 work_types → work_categories 로만 갈린다 (접수대장 목록과 같은 방식)
  const { data: workTypes, error: typeError } = await supabase
    .from('work_types')
    .select('id, work_categories!inner( name )')
    .eq('work_categories.name', category)
  if (typeError) throw typeError
  const typeIds = (workTypes ?? []).map((wt: { id: string }) => wt.id)
  if (typeIds.length === 0) {
    projectCache.set(category, [])
    return []
  }

  const rows = await fetchAllPages<AsProjectOption>((from, to) =>
    supabase
      .from('projects')
      .select('id, building_name, dong, ho, road_address, jibun_address, year')
      .in('work_type_id', typeIds)
      .order('building_name')
      .order('id')
      .range(from, to),
  )
  projectCache.set(category, rows)
  return rows
}

export default function AsTargetPicker({
  category,
  siteId,
  projectId,
  siteName,
  onPick,
  onClear,
}: {
  category: AsCategory
  siteId: string | null
  projectId: string | null
  siteName: string
  onPick: (pick: AsTargetPick) => void
  onClear: () => void
}) {
  const fromProjects = isProjectCategory(category)
  const [sites, setSites] = useState<AsSiteOption[]>([])
  const [projects, setProjects] = useState<AsProjectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [year, setYear] = useState<number | typeof AS_YEAR_ALL>(AS_YEAR_ALL)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (fromProjects) {
        setProjects(await loadProjects(category as '수도' | '소규모'))
      } else {
        setSites(await loadSites())
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [category, fromProjects])

  useEffect(() => { load() }, [load])

  // 구분을 바꾸면 찾던 조건도 같이 비운다 — 수도에서 치던 검색어가 소규모 목록에 남으면 헷갈린다
  useEffect(() => { setQuery(''); setYear(AS_YEAR_ALL) }, [category])

  const years = useMemo(() => asProjectYears(projects), [projects])

  const hits: AsTargetHit[] = useMemo(() => {
    const all = fromProjects ? asProjectHits(projects, year, query) : asSiteHits(sites, query)
    return all.slice(0, AS_TARGET_LIMIT)
  }, [fromProjects, projects, sites, year, query])

  if (siteId || projectId) {
    return (
      <div>
        <label className="block text-sm font-medium text-txt-secondary mb-1">
          {fromProjects ? '접수 현장' : '현장'}
        </label>
        <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">{siteName || '(이름없음)'}</span>
          <button
            type="button"
            onClick={onClear}
            aria-label="현장 선택 해제"
            className="shrink-0 text-txt-tertiary hover:text-txt-secondary"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-txt-tertiary">아래 현장명·주소는 그대로 고칠 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-txt-secondary mb-1">
        {fromProjects ? '접수 현장 찾기' : '현장 찾기'}
      </label>

      <div className="flex gap-2">
        {fromProjects && (
          <select
            value={year === AS_YEAR_ALL ? AS_YEAR_ALL : String(year)}
            onChange={e => setYear(e.target.value === AS_YEAR_ALL ? AS_YEAR_ALL : Number(e.target.value))}
            aria-label="진행연도"
            className="w-[88px] shrink-0 border border-border-primary rounded-lg px-2 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
          >
            <option value={AS_YEAR_ALL}>{AS_YEAR_ALL}</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={fromProjects ? '빌라명 검색' : '현장명 검색'}
            aria-label={fromProjects ? '빌라명 검색' : '현장명 검색'}
            autoComplete="off"
            className="w-full border border-border-primary rounded-lg pl-9 pr-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
          />
        </div>
      </div>

      {loading ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-txt-tertiary">
          <Loader2 size={12} className="animate-spin" />
          목록 불러오는 중...
        </p>
      ) : loadError ? (
        <p className="mt-2 text-[12px] text-[#b91c1c]">
          목록을 읽지 못했습니다 ({loadError}).{' '}
          <button type="button" onClick={load} className="underline">다시 시도</button>
        </p>
      ) : hits.length > 0 ? (
        <div
          role="listbox"
          aria-label="현장 검색 결과"
          className="mt-2 max-h-[180px] overflow-y-auto rounded-lg border border-border-primary bg-surface"
        >
          {hits.map(hit => (
            <button
              key={hit.key}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onPick(hit)}
              className="flex w-full items-center justify-between gap-2 border-b border-border-tertiary px-3 py-2 text-left last:border-0 hover:bg-surface-secondary transition"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-txt-primary">{hit.site_name}</span>
                {hit.address && <span className="block truncate text-[11px] text-txt-tertiary">{hit.address}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-txt-tertiary">{hit.note}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-txt-tertiary">
          {fromProjects && year === AS_YEAR_ALL && !query.trim()
            ? '연도를 고르거나 빌라명을 입력하세요.'
            : '찾는 현장이 없습니다. 아래 현장명·주소에 직접 적어도 됩니다.'}
        </p>
      )}
    </div>
  )
}
