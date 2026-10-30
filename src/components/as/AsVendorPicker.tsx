'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * 담당업체 고르기 — 거래처DB에서 찾되, 손으로 적는 길도 열어 둔다.
 *
 * 기존 기록은 업체명을 그냥 쳐 넣은 글자(as_records.assigned_vendor_id)다. 거래처DB에
 * 없는 업체(하루 부르고 마는 곳)도 적어야 해서 자유 입력을 막지 않는다. 대신 목록에서
 * 고르면 vendor_id 도 같이 남겨, 나중에 업체별로 A/S를 묶어 볼 수 있게 한다.
 *
 * 고른 뒤 이름을 고치면 vendor_id 는 떼어 낸다 — 이름과 연결이 어긋난 채 남으면
 * 업체별 집계가 조용히 틀어진다.
 */
export default function AsVendorPicker({
  name,
  onChange,
}: {
  name: string
  onChange: (next: { name: string; vendorId: string | null }) => void
}) {
  // 검색 결과는 "어떤 글자로 찾은 것인지"와 함께 들고 있는다. 그래야 다음 글자를 치는
  // 사이에 앞 글자의 결과가 잠깐 보이는 일이 없다.
  const [hits, setHits] = useState<{ query: string; rows: { id: string; name: string }[] }>({ query: '', rows: [] })
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const query = name.trim()
  const vendors = hits.query === query ? hits.rows : []

  useEffect(() => {
    if (!query) return
    let cancelled = false
    supabase
      .from('vendors')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10)
      .then(({ data }) => { if (!cancelled) setHits({ query, rows: data ?? [] }) })
    return () => { cancelled = true }
  }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-sm font-medium text-txt-secondary mb-1">담당업체</label>
      <input
        type="text"
        value={name}
        onChange={e => { onChange({ name: e.target.value, vendorId: null }); setOpen(true) }}
        onFocus={() => query !== '' && setOpen(true)}
        placeholder="거래처 검색 또는 직접 입력"
        autoComplete="off"
        className="w-full border border-border-primary rounded-lg px-3 h-[36px] text-sm focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
      />
      {open && vendors.length > 0 && (
        <div
          role="listbox"
          aria-label="거래처 검색 결과"
          className="absolute left-0 right-0 z-20 mt-1 max-h-[160px] overflow-y-auto rounded-lg border border-border-primary bg-surface shadow-lg"
        >
          {vendors.map(v => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onChange({ name: v.name, vendorId: v.id }); setOpen(false) }}
              className="w-full border-b border-border-tertiary px-3 py-2 text-left text-[13px] text-txt-primary last:border-0 hover:bg-surface-secondary transition"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
