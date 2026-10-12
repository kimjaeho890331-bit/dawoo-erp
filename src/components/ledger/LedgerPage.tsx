'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canSeeLedger } from '@/lib/ledgerAccess'
import CardAnalysis from '@/components/ledger/CardAnalysis'
import LeakCheck from '@/components/ledger/LeakCheck'

const STAFF_KEY = 'dawoo_current_staff_id'

type Tab = 'card' | 'leak'
const TABS: { key: Tab; label: string }[] = [
  { key: 'card', label: '법인카드' },
  // 통장·카드에서 매달 새는 돈을 찾는 1차 정리 (2026-10 대표: 「빠져나가는 1원까지 알고 싶다」)
  { key: 'leak', label: '새는 돈 찾기' },
]

// 경리 = 「법인카드」 + 「새는 돈 찾기」 두 탭. 지출관리에 있던 카드분석을 여기로 합쳤다 (2026-10-08 대표).
// 카드별 담당(끝 4자리 포함)은 카드분석 안 「카드별 담당자」에서 보고 고친다.
export default function LedgerPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('card')

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
        <p className="text-[13px] text-txt-tertiary mt-1">법인카드 사용내역과 담당, 이상 결제, 통장·카드에서 매달 새는 돈을 봅니다. 직원 화면에는 올리지 않습니다.</p>
      </div>
      {/* 탭을 바꾸면 그 탭 내용을 새로 읽는다 — 카드 CSV를 올리고 「새는 돈 찾기」로 오면 바로 반영된다 */}
      <div className="tabs-container">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`tab-item ${tab === t.key ? 'tab-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'card' ? <CardAnalysis /> : <LeakCheck onGoCard={() => setTab('card')} />}
    </div>
  )
}
