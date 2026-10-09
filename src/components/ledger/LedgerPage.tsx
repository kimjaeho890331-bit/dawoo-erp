'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canSeeLedger } from '@/lib/ledgerAccess'
import CardAnalysis from '@/components/ledger/CardAnalysis'

const STAFF_KEY = 'dawoo_current_staff_id'

// 경리 = 법인카드 한 곳. 지출관리에 있던 카드분석을 여기로 합쳤다 (2026-10-08 대표).
// 카드별 담당(끝 4자리 포함)은 카드분석 안 「카드별 담당자」에서 보고 고친다.
export default function LedgerPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = typeof window !== 'undefined' ? localStorage.getItem(STAFF_KEY) : null
      if (!id) {
        if (!cancelled) setAllowed(false)
        return
      }
      const { data: me } = await supabase.from('staff').select('role').eq('id', id).maybeSingle()
      if (!cancelled) setAllowed(canSeeLedger(me?.role))
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
    <div className="md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-txt-primary">경리</h1>
        <p className="text-[13px] text-txt-tertiary mt-1">법인카드 사용내역과 담당, 이상 결제를 봅니다. 직원 화면에는 올리지 않습니다.</p>
      </div>
      <CardAnalysis />
    </div>
  )
}
