'use client'

import { useEffect, useRef, useState } from 'react'
import { STAFF_COLOR_PALETTE, isValidHex, normalizeHex } from '@/lib/staff-colors'

/**
 * 직원 색상 변경 팝오버 — 캘린더 직원 칩 우클릭 시 표시.
 * 프리셋 48색(직원관리 모달과 동일 팔레트) + 자유 색상 피커 + hex 입력.
 * 스와치 클릭 즉시 onSelect 호출(저장), 자유 색상은 적용 버튼으로 확정.
 */
export default function StaffColorPopover({ staffName, color, anchor, onSelect, onClose }: {
  staffName: string
  color: string
  anchor: { x: number; y: number }
  onSelect: (color: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [customColor, setCustomColor] = useState(color)
  const [hexInput, setHexInput] = useState(color)

  // 외부 클릭 / ESC 닫기
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // 화면 밖으로 나가지 않게 위치 보정
  const width = 232
  const left = Math.max(8, Math.min(anchor.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - width - 8))

  const handleHexChange = (v: string) => {
    setHexInput(v)
    if (isValidHex(v)) setCustomColor(normalizeHex(v))
  }

  return (
    <div ref={ref}
      className="fixed z-50 bg-surface border border-border-primary rounded-[10px] shadow-[0_8px_30px_rgba(0,0,0,0.15)] p-3"
      style={{ left, top: anchor.y, width }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-txt-primary">{staffName} 색상</span>
        <button onClick={onClose} className="text-txt-tertiary hover:text-txt-secondary text-sm leading-none">&times;</button>
      </div>

      {/* 프리셋 48색 그리드 */}
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {STAFF_COLOR_PALETTE.map(c => (
          <button key={c} type="button" onClick={() => onSelect(c)} title={c}
            className={`w-7 h-7 rounded-md transition-all ${color.toLowerCase() === c.toLowerCase()
              ? 'ring-2 ring-offset-1 ring-accent scale-110'
              : 'hover:scale-110 hover:ring-1 hover:ring-border-secondary'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>

      {/* 자유 색상 */}
      <div className="flex items-center gap-2 pt-2 border-t border-border-tertiary">
        <input type="color" value={customColor}
          onChange={e => { setCustomColor(e.target.value); setHexInput(e.target.value) }}
          className="w-8 h-8 rounded cursor-pointer border border-border-primary bg-surface p-0.5 shrink-0" />
        <input value={hexInput} onChange={e => handleHexChange(e.target.value)} placeholder="#5e6ad2" spellCheck={false}
          className="flex-1 min-w-0 h-[30px] bg-surface border border-border-primary rounded-lg px-2 text-[12px] font-mono focus:border-accent focus:outline-none" />
        <button type="button" onClick={() => { if (isValidHex(hexInput)) onSelect(normalizeHex(hexInput)) }}
          disabled={!isValidHex(hexInput)}
          className="shrink-0 h-[30px] px-2.5 text-[12px] font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition">
          적용
        </button>
      </div>
    </div>
  )
}
