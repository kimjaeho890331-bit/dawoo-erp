'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseBankInfo } from '@/lib/approval/vendorBank'
import type { PaymentRow } from '@/types/approval'

export interface VendorOption {
  id: string
  name: string
  business_number: string | null
  bank_name: string | null
  account_number: string | null
  bank_info: string | null
}

interface Props {
  value: string
  vendors: VendorOption[]
  onInput: (value: string) => void
  onSelect: (patch: Partial<PaymentRow>) => void
  className: string
  placeholder?: string
}

/**
 * 지급정보 거래처명 칸 — 자유 입력 + 거래처DB 후보 선택.
 *
 * 후보 목록은 표(overflow-hidden) 바깥으로 잘리면 안 되므로 document.body에 포탈로 띄운다.
 * 목록에 없는 이름을 그냥 타이핑해서 쓰는 것도 항상 가능해야 한다 (강제 선택 아님).
 */
export default function VendorNameCell({ value, vendors, onInput, onSelect, className, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const query = value.trim()
  const filtered = query ? vendors.filter(v => v.name.includes(query)) : vendors

  const openList = () => {
    const el = inputRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    // 후보 목록 자신을 스크롤하는 것까지 닫아버리면 목록을 내려볼 수가 없다.
    // 바깥이 스크롤될 때는 닫는 대신 input 위치를 다시 재서 따라가게 한다.
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const offscreen = r.bottom < 0 || r.top > window.innerHeight
      if (offscreen) { setOpen(false); return }
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    }
    const close = () => setOpen(false)

    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const pick = (v: VendorOption) => {
    const resolved = v.bank_name && v.account_number
      ? { bank: v.bank_name, account: v.account_number }
      : parseBankInfo(v.bank_info)

    onSelect({
      vendor_name: v.name,
      bank: resolved?.bank ?? '',
      account_no: resolved?.account ?? '',
      business_no: v.business_number ?? '',
    })
    setOpen(false)
  }

  return (
    <>
      <input
        ref={inputRef}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onInput(e.target.value); openList() }}
        onFocus={openList}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && rect && createPortal(
        <div
          ref={listRef}
          // 스크롤바를 잡을 때 input이 blur되어 목록이 닫히는 것을 막는다.
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 max-h-56 overflow-y-auto bg-surface border border-border-primary rounded-lg shadow-lg"
        >
          {filtered.map(v => (
            <button
              key={v.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(v)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-surface-secondary text-txt-primary"
            >
              <div className="font-medium">{v.name}</div>
              {v.business_number && <div className="text-txt-tertiary">{v.business_number}</div>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
