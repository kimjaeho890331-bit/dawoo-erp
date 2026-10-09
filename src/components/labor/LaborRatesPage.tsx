'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_RATES, RATE_FIELDS, type LaborRates } from '@/lib/labor/rates'
import { toast } from '@/lib/toast'

// 일용직 공제 요율 설정. 한 줄 = "이 달부터 적용".
// [저장]을 눌러야 반영된다 (근무관리 표에서 실수로 바뀌지 않도록 여기서만 고친다).

interface Row {
  id: string
  year: number
  month: number
  values: Record<keyof LaborRates, string>
}

const keyOf = (r: { year: number; month: number }) => `${r.year}-${r.month}`
const toValues = (rates: Partial<LaborRates> | null): Row['values'] => {
  const merged = { ...DEFAULT_RATES, ...(rates ?? {}) }
  return Object.fromEntries(RATE_FIELDS.map(f => [f.key, String(merged[f.key])])) as Row['values']
}

export default function LaborRatesPage() {
  const now = new Date()
  const [rows, setRows] = useState<Row[]>([])
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('labor_rates').select('year, month, rates')
      .order('year').order('month')
    if (error) { toast.error(`요율을 불러오지 못했습니다: ${error.message}`); setLoading(false); return }
    const loaded = (data ?? []).map(d => ({ id: keyOf(d), year: d.year, month: d.month, values: toValues(d.rates) }))
    setRows(loaded)
    setSavedKeys(loaded.map(keyOf))
    setDirty(false)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 저장 안 한 채 창을 닫으려 하면 한 번 묻는다
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const addRow = () => {
    // 이번 달부터, 이미 있으면 그다음 빈 달. 값은 마지막 줄을 그대로 가져와 고칠 것만 고치게 한다.
    let y = now.getFullYear()
    let m = now.getMonth() + 1
    const taken = new Set(rows.map(keyOf))
    while (taken.has(`${y}-${m}`)) { m++; if (m > 12) { m = 1; y++ } }
    const last = [...rows].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)).at(-1)
    setRows(prev => [...prev, { id: `new-${Date.now()}`, year: y, month: m, values: last ? { ...last.values } : toValues(null) }])
    setDirty(true)
  }

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id))
    setDirty(true)
  }

  const handleSave = async () => {
    const keys = rows.map(keyOf)
    if (new Set(keys).size !== keys.length) { toast.info('적용 시작월이 같은 줄이 있습니다. 한 달에 한 줄만 둘 수 있습니다.'); return }
    const payload: { year: number; month: number; rates: LaborRates; updated_at: string }[] = []
    for (const r of rows) {
      const rates = {} as LaborRates
      for (const f of RATE_FIELDS) {
        const v = Number(r.values[f.key])
        if (r.values[f.key].trim() === '' || !Number.isFinite(v) || v < 0 || v > 100) {
          toast.info(`${r.year}년 ${r.month}월 ${f.label} 요율을 확인해 주세요. (0~100 사이 숫자)`)
          return
        }
        rates[f.key] = v
      }
      payload.push({ year: r.year, month: r.month, rates, updated_at: new Date().toISOString() })
    }
    if (!confirm('요율을 저장합니다.\n\n해당 달의 자동계산 공제액이 새 요율로 다시 계산됩니다.\n직접 입력한 공제액은 바뀌지 않습니다.\n\n저장할까요?')) return

    setSaving(true)
    const removed = savedKeys.filter(k => !keys.includes(k))
    for (const k of removed) {
      const [y, m] = k.split('-').map(Number)
      const { error } = await supabase.from('labor_rates').delete().eq('year', y).eq('month', m)
      if (error) { setSaving(false); toast.error(`저장 실패: ${error.message}`); return }
    }
    if (payload.length > 0) {
      const { error } = await supabase.from('labor_rates').upsert(payload)
      if (error) { setSaving(false); toast.error(`저장 실패: ${error.message}`); return }
    }
    setSaving(false)
    await load()
    toast.success('요율을 저장했습니다.')
  }

  const sorted = [...rows].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i)

  const th = 'border-b border-border-primary px-3 py-2.5 text-[12px] font-medium text-txt-tertiary bg-surface-secondary whitespace-nowrap'
  const td = 'border-b border-border-tertiary px-3 py-2 text-sm'
  const selectCls = 'border border-border-primary rounded-lg px-2 h-[32px] text-sm outline-none focus:border-accent bg-surface'

  return (
    <div className="md:p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/labor" className="inline-flex items-center gap-1 text-sm text-txt-tertiary hover:text-txt-secondary">
            <ArrowLeft size={14} /> 일용직 근무관리
          </Link>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary mt-1">공제 요율 설정</h1>
        </div>
        <button onClick={handleSave} disabled={saving || loading || !dirty}
          className="btn-primary">
          {saving ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <p className="text-sm text-txt-tertiary leading-relaxed">
        한 줄은 <b className="text-txt-secondary">그 달부터 적용</b>되는 요율입니다. 다음 줄의 시작월 전까지 계속 쓰입니다.<br />
        요율이 바뀌면 줄을 고치지 말고 <b className="text-txt-secondary">새 줄을 추가</b>하세요. 그래야 지난 달 금액이 바뀌지 않습니다.
      </p>

      <div className="bg-surface border border-border-primary rounded-[10px] overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-txt-tertiary">로딩 중...</div>
        ) : (
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className={`${th} text-left`}>적용 시작</th>
                {RATE_FIELDS.map(f => <th key={f.key} className={`${th} text-right`}>{f.label} (%)</th>)}
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${td} text-txt-tertiary`}>기본값 <span className="text-[12px]">(아래 줄 이전의 달)</span></td>
                {RATE_FIELDS.map(f => (
                  <td key={f.key} className={`${td} text-right tabular-nums text-txt-tertiary`}>{DEFAULT_RATES[f.key]}</td>
                ))}
                <td className={td}></td>
              </tr>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      <select value={r.year} onChange={e => update(r.id, { year: Number(e.target.value) })} className={selectCls}>
                        {[...new Set([r.year, ...years])].sort().map(y => <option key={y} value={y}>{y}년</option>)}
                      </select>
                      <select value={r.month} onChange={e => update(r.id, { month: Number(e.target.value) })} className={selectCls}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월부터</option>)}
                      </select>
                    </div>
                  </td>
                  {RATE_FIELDS.map(f => (
                    <td key={f.key} className={`${td} text-right`}>
                      <input type="text" inputMode="decimal" value={r.values[f.key]}
                        onChange={e => update(r.id, { values: { ...r.values, [f.key]: e.target.value } })}
                        className="w-[72px] border border-border-primary rounded-lg px-2 h-[32px] text-sm text-right tabular-nums outline-none focus:border-accent bg-surface" />
                    </td>
                  ))}
                  <td className={`${td} text-center`}>
                    <button onClick={() => removeRow(r.id)} aria-label="삭제" className="text-txt-quaternary hover:text-danger transition">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button onClick={addRow} disabled={loading}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-dashed border-border-secondary text-txt-tertiary rounded-lg hover:border-accent hover:text-accent-text transition disabled:opacity-50">
        <Plus size={15} /> 적용 시작월 추가
      </button>

      <div className="text-xs text-txt-quaternary leading-relaxed">
        <p className="font-medium text-txt-tertiary mb-1">계산 기준</p>
        {RATE_FIELDS.map(f => <p key={f.key}>· {f.label}: {f.basis}</p>)}
        <p>· 소득세는 하루 세액이 1,000원 미만이면 0원(소액부징수), 모든 공제는 10원 미만을 버립니다.</p>
        <p>· 근무관리 표에서 공제 칸에 직접 입력한 금액은 요율을 바꿔도 그대로입니다.</p>
      </div>
    </div>
  )
}
