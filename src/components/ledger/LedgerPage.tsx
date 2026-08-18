'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canSeeLedger } from '@/lib/ledgerAccess'

interface CardRow {
  id: string
  card_name: string
  card_last4: string | null
  staff_id: string | null
}

interface Staff {
  id: string
  name: string
  role: string
}

const STAFF_KEY = 'dawoo_current_staff_id'

export default function LedgerPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [cards, setCards] = useState<CardRow[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const staffName = (id: string | null) => {
    if (!id) return ''
    return staffList.find(s => s.id === id)?.name || ''
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = typeof window !== 'undefined' ? localStorage.getItem(STAFF_KEY) : null
      if (!id) {
        if (!cancelled) setAllowed(false)
        return
      }
      const { data: me } = await supabase.from('staff').select('role').eq('id', id).maybeSingle()
      const ok = canSeeLedger(me?.role)
      if (cancelled) return
      setAllowed(ok)
      if (!ok) return
      const [c, s] = await Promise.all([
        supabase.from('card_mappings').select('id, card_name, card_last4, staff_id').order('card_last4'),
        supabase.from('staff').select('id, name, role').order('name'),
      ])
      if (cancelled) return
      if (!c.error) setCards((c.data as CardRow[]) || [])
      if (!s.error) setStaffList((s.data as Staff[]) || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  if (allowed !== true) {
    return <div className="p-6 text-[13px] text-txt-tertiary">확인 중...</div>
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-txt-primary">경리</h1>
        <p className="text-[13px] text-txt-tertiary mt-1">법인카드 끝자리와 담당만 봅니다. 직원 화면에는 올리지 않습니다.</p>
      </div>

      <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[13px] text-txt-quaternary">불러오는 중...</div>
        ) : cards.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-txt-quaternary">등록된 카드가 없습니다</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-secondary border-b border-border-primary">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-txt-tertiary">끝 4자리</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-txt-tertiary">담당</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-txt-tertiary">카드명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-secondary">
              {cards.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-medium text-txt-primary tabular-nums">{c.card_last4 || '—'}</td>
                  <td className="px-4 py-2.5 text-txt-primary">{staffName(c.staff_id) || c.card_name}</td>
                  <td className="px-4 py-2.5 text-txt-secondary">{c.card_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
