'use client'

/**
 * 건축 원가계산서 비율 — 조달청 간접공사비 제비율.
 *
 * 견적서를 쓰면서 옆에 띄워놓고 확인하는 화면이다. 그래서 읽는 게 먼저고,
 * 고치는 건 '수정'을 눌렀을 때만 된다. 조달청 기준이 반기마다 바뀌므로
 * 표·적용기간·캡처를 모두 화면에서 고칠 수 있다.
 *
 * 기준 칸(50억 미만, 10억 미만 …)이 견적에서 바로 필요하므로 표를 전체 폭으로 둔다.
 * 조달청 캡처는 들어오면 바로 보이게 펴둔다. 접어뒀더니 캡처가 있는지조차
 * 몰라서 결국 조달청을 다시 열어보게 됐다. 접는 버튼은 남겨둔다.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, X, ChevronDown, ChevronRight, Upload, Trash2, ExternalLink } from 'lucide-react'
import { toast } from '@/lib/toast'

interface CostRatio {
  id: string
  sort_order: number
  item: string
  rate: number | null
  basis: string | null
  criteria: string | null
}

interface Settings {
  effective_from: string | null
  effective_to: string | null
  capture_url: string | null
  capture_name: string | null
  source_note: string | null
}

const EMPTY_SETTINGS: Settings = {
  effective_from: null,
  effective_to: null,
  capture_url: null,
  capture_name: null,
  source_note: null,
}

/** 새 행은 저장 전까지 id가 없다 — 임시 키로 구분한다 */
type DraftRow = CostRatio & { isNew?: boolean }

const SKELETON_ROWS = 6

/**
 * 조달청 업무별자료 → 시설공사 게시판.
 * 제비율 변경알림이 올라오는 곳이다. 게시판 검색어는 주소로 미리 넣을 수 없어
 * (POST로만 받는다) 게시판까지만 연결하고, 검색어는 아래 안내에 남겨둔다.
 */
const PPS_BOARD_URL = 'https://www.pps.go.kr/kor/bbs/list.do?key=00038'

/** 안내글에 적힌 주소를 눌러 열 수 있게 한다. 주소는 화면에서 고칠 수 있다. */
function LinkedNote({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <p className="text-[12px] text-txt-secondary whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-accent-text underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  )
}

export default function CostRatioPage() {
  const [rows, setRows] = useState<CostRatio[]>([])
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [draftSettings, setDraftSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [captureOpen, setCaptureOpen] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [ratioRes, setRes] = await Promise.all([
      supabase.from('cost_ratios').select('*').order('sort_order').order('item'),
      supabase.from('cost_ratio_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    // 표가 아직 없는 DB(마이그레이션 전)에서도 화면이 깨지지 않게 안내만 띄운다
    if (ratioRes.error) {
      setTableMissing(true)
      setLoading(false)
      return
    }
    setRows((ratioRes.data || []) as CostRatio[])
    setSettings((setRes.data as Settings) || EMPTY_SETTINGS)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    setDraft(rows.map(r => ({ ...r })))
    setDraftSettings({ ...settings })
    setRemovedIds([])
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft([])
    setRemovedIds([])
  }

  const updateRow = (idx: number, patch: Partial<DraftRow>) => {
    setDraft(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    const nextOrder = draft.length > 0 ? Math.max(...draft.map(r => r.sort_order)) + 10 : 10
    setDraft(prev => [...prev, {
      id: `new-${Date.now()}-${prev.length}`,
      sort_order: nextOrder,
      item: '',
      rate: null,
      basis: '',
      criteria: '',
      isNew: true,
    }])
  }

  const removeRow = (idx: number) => {
    const row = draft[idx]
    if (!row.isNew) setRemovedIds(prev => [...prev, row.id])
    setDraft(prev => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    const named = draft.filter(r => r.item.trim())
    if (named.length !== draft.length) {
      toast.error('비목이 빈 줄이 있습니다')
      return
    }
    const names = named.map(r => r.item.trim())
    if (new Set(names).size !== names.length) {
      toast.error('비목이 중복됩니다')
      return
    }

    setSaving(true)
    try {
      if (removedIds.length > 0) {
        const { error } = await supabase.from('cost_ratios').delete().in('id', removedIds)
        if (error) throw error
      }

      // 새 줄은 insert, 기존 줄은 update — upsert 는 id가 바뀌어 이력이 끊긴다
      const inserts = named.filter(r => r.isNew).map(r => ({
        sort_order: r.sort_order,
        item: r.item.trim(),
        rate: r.rate,
        basis: r.basis?.trim() || null,
        criteria: r.criteria?.trim() || null,
      }))
      if (inserts.length > 0) {
        const { error } = await supabase.from('cost_ratios').insert(inserts)
        if (error) throw error
      }

      for (const r of named.filter(x => !x.isNew)) {
        const before = rows.find(x => x.id === r.id)
        const changed = !before
          || before.item !== r.item.trim()
          || before.rate !== r.rate
          || (before.basis || '') !== (r.basis?.trim() || '')
          || (before.criteria || '') !== (r.criteria?.trim() || '')
          || before.sort_order !== r.sort_order
        if (!changed) continue
        const { error } = await supabase.from('cost_ratios').update({
          sort_order: r.sort_order,
          item: r.item.trim(),
          rate: r.rate,
          basis: r.basis?.trim() || null,
          criteria: r.criteria?.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq('id', r.id)
        if (error) throw error
      }

      const { error: setErr } = await supabase.from('cost_ratio_settings').upsert({
        id: 1,
        effective_from: draftSettings.effective_from || null,
        effective_to: draftSettings.effective_to || null,
        capture_url: draftSettings.capture_url,
        capture_name: draftSettings.capture_name,
        source_note: draftSettings.source_note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      if (setErr) throw setErr

      toast.success('저장했습니다')
      setEditing(false)
      setDraft([])
      setRemovedIds([])
      await load()
    } catch (err) {
      console.error('비율 저장 실패:', err)
      toast.error('저장에 실패했습니다: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setSaving(false)
    }
  }

  const handleCapture = async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      // 업로드는 /api/storage/upload(service_role) 경유로만 한다 — 프론트 anon 키에는
      // Storage 쓰기 권한이 없어서 클라이언트에서 직접 올리면 실패한다.
      const fd = new FormData()
      fd.append('file', file)
      fd.append('storagePath', `attachments/cost-ratios/capture_${Date.now()}.${ext}`)

      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast.error('업로드 실패: ' + (json.error ?? `HTTP ${res.status}`)); return }

      if (editing) {
        setDraftSettings(prev => ({ ...prev, capture_url: json.url, capture_name: file.name }))
        toast.success('캡처를 올렸습니다. 저장을 눌러 반영하세요')
      } else {
        const { error } = await supabase.from('cost_ratio_settings')
          .upsert({ id: 1, capture_url: json.url, capture_name: file.name, updated_at: new Date().toISOString() })
        if (error) { toast.error('저장에 실패했습니다'); return }
        toast.success('캡처를 올렸습니다')
        await load()
      }
      setCaptureOpen(true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const view = editing ? draft : rows
  const viewSettings = editing ? draftSettings : settings

  const periodLabel = (() => {
    const from = viewSettings.effective_from
    const to = viewSettings.effective_to
    if (!from && !to) return '적용기간 미입력'
    const fmt = (d: string) => d.replaceAll('-', '. ')
    if (from && !to) return `${fmt(from)}. ~ 기준`
    if (!from && to) return `~ ${fmt(to!)}. 기준`
    return `${fmt(from!)}. ~ ${fmt(to!)}. 기준`
  })()

  if (tableMissing) {
    return (
      <div className="max-w-[1000px] mx-auto space-y-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">건축 원가계산서 비율</h1>
        <div className="bg-surface rounded-[10px] border border-border-primary px-5 py-8 text-center">
          <p className="text-[13px] text-txt-secondary">아직 표가 만들어지지 않았습니다.</p>
          <p className="text-[12px] text-txt-tertiary mt-1">
            데이터베이스에 <code className="px-1 bg-surface-tertiary rounded">032_cost_ratios.sql</code> 을 적용해야 합니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">
            건축 원가계산서 비율
          </h1>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={draftSettings.effective_from ?? ''}
                onChange={e => setDraftSettings(p => ({ ...p, effective_from: e.target.value || null }))}
                className="h-[30px] px-2 bg-surface border border-border-primary rounded-lg text-[12px] focus:outline-none focus:border-accent"
              />
              <span className="text-[12px] text-txt-tertiary">~</span>
              <input
                type="date"
                value={draftSettings.effective_to ?? ''}
                onChange={e => setDraftSettings(p => ({ ...p, effective_to: e.target.value || null }))}
                className="h-[30px] px-2 bg-surface border border-border-primary rounded-lg text-[12px] focus:outline-none focus:border-accent"
              />
            </div>
          ) : (
            <span className="px-2.5 py-1 bg-surface-secondary rounded-lg text-[12px] text-txt-secondary whitespace-nowrap">
              {periodLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={cancelEdit} disabled={saving}
                className="px-3 py-1.5 text-[13px] text-txt-secondary rounded-lg hover:bg-surface-secondary transition-colors disabled:opacity-50">
                취소
              </button>
              <button onClick={save} disabled={saving} className="btn-primary whitespace-nowrap disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </>
          ) : (
            <button onClick={startEdit} className="btn-primary whitespace-nowrap">수정</button>
          )}
        </div>
      </div>

      {/* 비율 표 */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="불러오는 중">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="bg-surface rounded-[10px] border border-border-primary px-5 py-3 flex items-center gap-3">
              <div className="h-3.5 flex-1 max-w-[180px] rounded bg-surface-tertiary animate-pulse" />
              <div className="h-3.5 w-12 rounded bg-surface-tertiary animate-pulse" />
              <div className="h-3.5 flex-1 max-w-[200px] rounded bg-surface-tertiary animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-txt-tertiary tracking-wider">비목</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-txt-tertiary tracking-wider w-[100px]">요율 (%)</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-txt-tertiary tracking-wider">구성비</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-txt-tertiary tracking-wider">기준</th>
                {editing && <th className="w-[44px]" />}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr>
                  <td colSpan={editing ? 5 : 4} className="px-4 py-8 text-center text-[13px] text-txt-tertiary">
                    등록된 비목이 없습니다
                  </td>
                </tr>
              )}
              {view.map((r, idx) => (
                <tr key={r.id} className="border-t border-border-primary">
                  {editing ? (
                    <>
                      <td className="px-2 py-1.5">
                        <input value={r.item} onChange={e => updateRow(idx, { item: e.target.value })}
                          placeholder="비목"
                          className="w-full h-[32px] px-2 bg-surface border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.001" value={r.rate ?? ''}
                          onChange={e => updateRow(idx, { rate: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-full h-[32px] px-2 bg-surface border border-border-primary rounded-lg text-[13px] text-right tabular-nums focus:outline-none focus:border-accent" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={r.basis ?? ''} onChange={e => updateRow(idx, { basis: e.target.value })}
                          placeholder="예: 직접노무비 × 율"
                          className="w-full h-[32px] px-2 bg-surface border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={r.criteria ?? ''} onChange={e => updateRow(idx, { criteria: e.target.value })}
                          placeholder="예: 10억 미만"
                          className="w-full h-[32px] px-2 bg-surface border border-border-primary rounded-lg text-[13px] focus:outline-none focus:border-accent" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeRow(idx)} aria-label={`${r.item || '빈 줄'} 삭제`}
                          className="p-1.5 text-txt-tertiary rounded hover:bg-surface-secondary transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-[13px] text-txt-primary">{r.item}</td>
                      <td className="px-4 py-2.5 text-[13px] font-semibold text-txt-primary text-right tabular-nums">
                        {r.rate ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-txt-secondary">{r.basis || '-'}</td>
                      <td className="px-4 py-2.5 text-[12px] text-txt-secondary">{r.criteria || '-'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {editing && (
            <div className="border-t border-border-primary px-3 py-2">
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-accent-text rounded-lg hover:bg-surface-secondary transition-colors">
                <Plus size={14} /> 비목 추가
              </button>
            </div>
          )}
        </div>
      )}

      {/* 조달청 캡처 — 들어오면 펴진 채로 보인다 */}
      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        <button onClick={() => setCaptureOpen(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-secondary transition-colors">
          {captureOpen ? <ChevronDown size={15} className="text-txt-tertiary" /> : <ChevronRight size={15} className="text-txt-tertiary" />}
          <span className="text-[13px] font-medium text-txt-primary">조달청 적용기준 캡처</span>
          {!viewSettings.capture_url && <span className="text-[11px] text-txt-tertiary">없음</span>}
        </button>

        {captureOpen && (
          <div className="border-t border-border-primary px-4 py-4 space-y-3">
            {viewSettings.capture_url ? (
              <a href={viewSettings.capture_url} target="_blank" rel="noopener noreferrer" className="block">
                {/* 캡처는 원본 비율을 봐야 해서 next/image 로 자르지 않는다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewSettings.capture_url} alt={viewSettings.capture_name || '조달청 적용기준 캡처'}
                  className="max-w-full rounded-lg border border-border-primary" />
              </a>
            ) : (
              <p className="text-[12px] text-txt-tertiary">올린 캡처가 없습니다.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleCapture(f) }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-accent-text border border-border-primary rounded-lg hover:bg-surface-secondary transition-colors disabled:opacity-50">
                <Upload size={13} /> {uploading ? '올리는 중...' : viewSettings.capture_url ? '캡처 교체' : '캡처 올리기'}
              </button>
              {viewSettings.capture_url && editing && (
                <button onClick={() => setDraftSettings(p => ({ ...p, capture_url: null, capture_name: null }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-txt-secondary rounded-lg hover:bg-surface-secondary transition-colors">
                  <X size={13} /> 캡처 지우기
                </button>
              )}
              {viewSettings.capture_name && (
                <span className="text-[11px] text-txt-tertiary">{viewSettings.capture_name}</span>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <p className="text-[11px] font-medium text-txt-tertiary">조달청에서 찾아가는 길</p>
                <a href={PPS_BOARD_URL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent-text border border-border-primary rounded-md hover:bg-surface-secondary transition-colors">
                  <ExternalLink size={11} /> 조달청 시설공사 자료실 열기
                </a>
              </div>
              {editing ? (
                <textarea value={draftSettings.source_note ?? ''} rows={3}
                  onChange={e => setDraftSettings(p => ({ ...p, source_note: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-border-primary rounded-lg text-[12px] focus:outline-none focus:border-accent" />
              ) : (
                <LinkedNote text={settings.source_note || '-'} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
