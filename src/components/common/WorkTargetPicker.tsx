'use client'

import { projectLabel, type WorkKind } from '@/lib/workTarget'

export interface WorkSiteOption { id: string; name: string }
export interface WorkProjectOption {
  id: string
  building_name: string | null
  ho?: string | null
  dong?: string | null
}

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
  const selectCls = compact
    ? 'w-full px-2 py-1.5 text-xs border border-border-primary rounded-lg bg-surface text-txt-primary'
    : 'input-field w-full'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {([
          { key: '' as WorkKind, label: '미지정' },
          { key: 'site' as WorkKind, label: '입찰·수의' },
          { key: 'project' as WorkKind, label: '지원사업' },
        ]).map(opt => (
          <button
            key={opt.key || 'none'}
            type="button"
            onClick={() => onChange({ kind: opt.key, siteId: '', projectId: '' })}
            className={`h-9 px-3 rounded-lg text-[13px] font-medium border cursor-pointer ${
              kind === opt.key
                ? 'bg-accent-light text-accent border-accent'
                : 'bg-surface text-txt-secondary border-border-primary hover:bg-surface-tertiary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {kind === 'site' && (
        <select
          aria-label="현장 선택"
          className={selectCls}
          value={siteId}
          onChange={e => onChange({ kind: 'site', siteId: e.target.value, projectId: '' })}
        >
          <option value="">현장을 고르세요</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {kind === 'project' && (
        <select
          aria-label="접수 건 선택"
          className={selectCls}
          value={projectId}
          onChange={e => onChange({ kind: 'project', siteId: '', projectId: e.target.value })}
        >
          <option value="">접수 건을 고르세요</option>
          {projects.map(p => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}
        </select>
      )}
      {kind === '' && (
        <p className="text-[11px] text-txt-tertiary">비워 두면 목록에 현장 없음으로 보입니다. 저장은 됩니다.</p>
      )}
    </div>
  )
}
