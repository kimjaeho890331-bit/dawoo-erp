'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseBankInfo } from '@/lib/approval/vendorBank'
import type { PaymentRow } from '@/types/approval'

export interface VendorOption {
  id: string
  name: string
  vendor_type: string | null
  business_number: string | null
  bank_name: string | null
  account_number: string | null
  bank_info: string | null
  phone: string | null
  resident_id: string | null
  id_card_url: string | null
  bankbook_url: string | null
  safety_cert_url: string | null
}

interface Props {
  value: string
  vendors: VendorOption[]
  onInput: (value: string) => void
  onSelect: (patch: Partial<PaymentRow>) => void
  onPickVendor?: (vendor: VendorOption) => void
  className: string
  placeholder?: string
}

/**
 * 지급정보 거래처명 칸 — 자유 입력 + 거래처DB 후보 선택.
 *
 * 후보 목록은 표(overflow-hidden) 바깥으로 잘리면 안 되므로 document.body에 포탈로 띄운다.
 * 목록에 없는 이름을 그냥 타이핑해서 쓰는 것도 항상 가능해야 한다 (강제 선택 아님).
 */
export default function VendorNameCell({ value, vendors, onInput, onSelect, onPickVendor, className, placeholder }: Props) {
  /**
   * 후보 목록의 위치. 아래 공간이 모자라면 입력칸 위로 띄운다(`bottom` 사용).
   * 폰에서는 입력칸이 화면 하단에 오는 일이 잦은데, 그때 아래로만 띄우면
   * 목록이 화면 밖으로 나가 후보를 못 고른다.
   */
  interface Placement {
    left: number
    width: number
    maxHeight: number
    top?: number
    bottom?: number
  }

  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<Placement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const query = value.trim()
  const filtered = query ? vendors.filter(v => v.name.includes(query)) : vendors

  const measure = (): Placement | null => {
    const el = inputRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const above = r.top
    const flipUp = below < 200 && above > below
    const space = (flipUp ? above : below) - 12
    return {
      left: r.left,
      width: Math.max(r.width, 220),
      maxHeight: Math.max(140, Math.min(space, 320)),
      top: flipUp ? undefined : r.bottom + 4,
      bottom: flipUp ? window.innerHeight - r.top + 4 : undefined,
    }
  }

  const openList = () => {
    const p = measure()
    if (p) setRect(p)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const offscreen = r.bottom < 0 || r.top > window.innerHeight
      if (offscreen) { setOpen(false); return }
      const p = measure()
      if (p) setRect(p)
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
    const isDaily = v.vendor_type === '일용직'
    const resolved = v.bank_name && v.account_number
      ? { bank: v.bank_name, account: v.account_number }
      : parseBankInfo(v.bank_info)

    onSelect({
      vendor_name: v.name,
      bank: resolved?.bank ?? '',
      account_no: resolved?.account ?? '',
      business_no: isDaily ? (v.resident_id ?? '') : (v.business_number ?? ''),
      vendor_id: v.id,
      vendor_type: v.vendor_type ?? '',
      phone: v.phone ?? '',
      resident_id: v.resident_id ?? '',
    })
    onPickVendor?.(v)
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
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'fixed',
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            maxHeight: rect.maxHeight,
          }}
          className="z-50 overflow-y-auto bg-surface border border-border-primary rounded-lg shadow-lg"
        >
          {filtered.map(v => (
            <button
              key={v.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(v)}
              className="w-full text-left px-3 py-3 text-sm hover:bg-surface-secondary text-txt-primary md:py-2 md:text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.vendor_type === '일용직' && (
                  <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-txt-tertiary">일용직</span>
                )}
              </div>
              {v.vendor_type === '일용직'
                ? (v.phone && <div className="text-txt-tertiary text-xs">{v.phone}</div>)
                : (v.business_number && <div className="text-txt-tertiary text-xs">{v.business_number}</div>)}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
