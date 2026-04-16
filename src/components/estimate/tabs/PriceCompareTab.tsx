'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatNumber } from '../estimateCalc'
import { LABOR_PRICES, MATERIAL_PRICES } from '../estimateData'
import { Plus, X, RotateCcw } from 'lucide-react'

// ── 타입 ──

interface LaborRow {
  id: string
  name: string
  unit: string
  price: number
  reference: string
}

interface MaterialRow {
  id: string
  category: string
  name: string
  spec: string
  unit: string
  price: number
  reference: string
  page: string
}

const STORAGE_KEY = 'dawoo_erp_unit_prices'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function defaultLabor(): LaborRow[] {
  return LABOR_PRICES.map(p => ({ ...p, id: uid() }))
}

function defaultMaterial(): MaterialRow[] {
  return MATERIAL_PRICES.map(p => ({ ...p, id: uid() }))
}

function loadPrices(): { labor: LaborRow[]; material: MaterialRow[]; referenceDate: string } {
  if (typeof window === 'undefined') return { labor: defaultLabor(), material: defaultMaterial(), referenceDate: '2025-07' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { labor: defaultLabor(), material: defaultMaterial(), referenceDate: '2025-07' }
    const parsed = JSON.parse(raw)
    return {
      labor: parsed.labor?.length ? parsed.labor : defaultLabor(),
      material: parsed.material?.length ? parsed.material : defaultMaterial(),
      referenceDate: parsed.referenceDate || '2025-07',
    }
  } catch {
    return { labor: defaultLabor(), material: defaultMaterial(), referenceDate: '2025-07' }
  }
}

// ── 카테고리 색상 ──
const CAT_COLORS: Record<string, string> = {
  '방수': 'bg-blue-100 text-blue-700',
  '기와': 'bg-orange-100 text-orange-700',
  '도장': 'bg-green-100 text-green-700',
  '발수': 'bg-cyan-100 text-cyan-700',
  '보수': 'bg-yellow-100 text-yellow-700',
  '공통': 'bg-gray-100 text-gray-600',
}

// ── 메인 컴포넌트 ──

export default function PriceCompareTab() {
  const [labor, setLabor] = useState<LaborRow[]>([])
  const [material, setMaterial] = useState<MaterialRow[]>([])
  const [referenceDate, setReferenceDate] = useState('2025-07')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const loaded = loadPrices()
    setLabor(loaded.labor)
    setMaterial(loaded.material)
    setReferenceDate(loaded.referenceDate)
  }, [])

  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ labor, material, referenceDate }))
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [labor, material, referenceDate])

  const reset = () => {
    if (!confirm('초기값(엑셀 원본)으로 되돌리시겠습니까?')) return
    setLabor(defaultLabor())
    setMaterial(defaultMaterial())
    setReferenceDate('2025-07')
    setDirty(true)
  }

  // ── 노임 CRUD ──
  const updateLabor = (id: string, field: keyof LaborRow, value: string | number) => {
    setLabor(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setDirty(true)
  }
  const addLabor = () => {
    setLabor(prev => [...prev, { id: uid(), name: '', unit: '인', price: 0, reference: referenceDate }])
    setDirty(true)
  }
  const removeLabor = (id: string) => {
    setLabor(prev => prev.filter(r => r.id !== id))
    setDirty(true)
  }

  // ── 재료 CRUD ──
  const updateMaterial = (id: string, field: keyof MaterialRow, value: string | number) => {
    setMaterial(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setDirty(true)
  }
  const addMaterial = () => {
    setMaterial(prev => [...prev, { id: uid(), category: '', name: '', spec: '', unit: '', price: 0, reference: referenceDate, page: '' }])
    setDirty(true)
  }
  const removeMaterial = (id: string) => {
    setMaterial(prev => prev.filter(r => r.id !== id))
    setDirty(true)
  }

  return (
    <div className="space-y-6">
      {/* 상단: 기준일 + 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-[12px] text-txt-tertiary">기준연월</label>
          <input
            type="text"
            value={referenceDate}
            onChange={e => { setReferenceDate(e.target.value); setDirty(true) }}
            placeholder="2025-07"
            className="h-[32px] w-[100px] border border-border-primary rounded-lg px-2 text-[13px] text-center bg-surface focus:border-accent focus:ring-1 focus:ring-accent-light outline-none"
          />
          <span className="text-[11px] text-txt-quaternary">기준</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[12px] text-[#16a34a] font-medium">✓ 저장됨</span>}
          {dirty && !saved && <span className="text-[11px] text-[#e57e25]">변경사항 있음</span>}
          <button onClick={reset} className="flex items-center gap-1 h-[32px] px-3 text-[12px] text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary transition">
            <RotateCcw size={12} /> 초기값
          </button>
          <button onClick={save} disabled={!dirty}
            className="h-[32px] px-4 text-[12px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition">
            저장
          </button>
        </div>
      </div>

      {/* ── 노임단가 ── */}
      <div>
        <h3 className="text-[14px] font-semibold text-txt-secondary mb-1">노임단가</h3>
        <p className="text-[11px] text-txt-quaternary mb-2">{referenceDate} 기준 · 단가 클릭하여 수정</p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="border border-border-primary px-2 py-2 text-left w-[200px]">직종</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                <th className="border border-border-primary px-2 py-2 text-right w-[140px]">단가 (원)</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[50px]"></th>
              </tr>
            </thead>
            <tbody>
              {labor.map(row => (
                <tr key={row.id} className="hover:bg-surface-secondary/30">
                  <td className="border border-border-primary px-1 py-0.5">
                    <input value={row.name} onChange={e => updateLabor(row.id, 'name', e.target.value)}
                      className="w-full h-[28px] px-1.5 text-[12px] bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                  </td>
                  <td className="border border-border-primary px-1 py-0.5 text-center">
                    <input value={row.unit} onChange={e => updateLabor(row.id, 'unit', e.target.value)}
                      className="w-full h-[28px] px-1 text-[12px] text-center bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                  </td>
                  <td className="border border-border-primary px-1 py-0.5">
                    <input type="number" value={row.price || ''} onChange={e => updateLabor(row.id, 'price', Number(e.target.value))}
                      className="w-full h-[28px] px-1.5 text-[12px] text-right tabular-nums bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                  </td>
                  <td className="border border-border-primary px-1 py-0.5 text-center">
                    <button onClick={() => removeLabor(row.id)} className="text-txt-quaternary hover:text-red-500 transition">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addLabor} className="mt-2 flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover transition px-2 py-1">
          <Plus size={13} /> 노임 추가
        </button>
      </div>

      {/* ── 재료단가 ── */}
      <div>
        <h3 className="text-[14px] font-semibold text-txt-secondary mb-1">재료단가</h3>
        <p className="text-[11px] text-txt-quaternary mb-2">{referenceDate} 기준 · 셀 클릭하여 수정</p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="border border-border-primary px-2 py-2 text-left w-[70px]">분류</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[150px]">품명</th>
                <th className="border border-border-primary px-2 py-2 text-left w-[160px]">규격</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[60px]">단위</th>
                <th className="border border-border-primary px-2 py-2 text-right w-[120px]">단가 (원)</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[70px]">참조 (p.)</th>
                <th className="border border-border-primary px-2 py-2 text-center w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {material.map(row => {
                const catColor = CAT_COLORS[row.category] || 'bg-gray-100 text-gray-600'
                return (
                  <tr key={row.id} className="hover:bg-surface-secondary/30">
                    <td className="border border-border-primary px-1 py-0.5">
                      <input value={row.category} onChange={e => updateMaterial(row.id, 'category', e.target.value)}
                        className={`w-full h-[28px] px-1.5 text-[11px] text-center rounded font-medium bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light ${row.category ? catColor : ''}`} />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5">
                      <input value={row.name} onChange={e => updateMaterial(row.id, 'name', e.target.value)}
                        className="w-full h-[28px] px-1.5 text-[12px] bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5">
                      <input value={row.spec} onChange={e => updateMaterial(row.id, 'spec', e.target.value)}
                        className="w-full h-[28px] px-1.5 text-[12px] text-txt-tertiary bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5">
                      <input value={row.unit} onChange={e => updateMaterial(row.id, 'unit', e.target.value)}
                        className="w-full h-[28px] px-1 text-[12px] text-center bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5">
                      <input type="number" value={row.price || ''} onChange={e => updateMaterial(row.id, 'price', Number(e.target.value))}
                        className="w-full h-[28px] px-1.5 text-[12px] text-right tabular-nums bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5">
                      <input value={row.page} onChange={e => updateMaterial(row.id, 'page', e.target.value)}
                        className="w-full h-[28px] px-1 text-[12px] text-center text-txt-quaternary bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-accent-light rounded" />
                    </td>
                    <td className="border border-border-primary px-1 py-0.5 text-center">
                      <button onClick={() => removeMaterial(row.id)} className="text-txt-quaternary hover:text-red-500 transition">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addMaterial} className="mt-2 flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover transition px-2 py-1">
          <Plus size={13} /> 재료 추가
        </button>
      </div>

      {/* 안내 */}
      <p className="text-[11px] text-txt-quaternary">
        ※ 단가 수정 후 [저장] 클릭하면 이 브라우저에 저장됩니다. 새 견적서 작성 시 여기서 저장한 단가가 적용됩니다.
      </p>
    </div>
  )
}
