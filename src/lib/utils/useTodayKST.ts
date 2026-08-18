'use client'

import { useEffect, useState } from 'react'
import { todayKST, msUntilNextMidnightKST } from './date'

// KST 기준 오늘 날짜('YYYY-MM-DD')를 반환하고, 자정이 지나면 자동으로 갱신한다.
// 화면을 켜둔 채 날이 바뀌어도 '오늘' 표시가 그대로 남는 문제를 방지.
export function useTodayKST(): string {
  const [today, setToday] = useState(todayKST)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const schedule = () => {
      timer = setTimeout(() => { setToday(todayKST()); schedule() }, msUntilNextMidnightKST())
    }
    schedule()

    // 절전/백그라운드 탭에서는 타이머가 밀릴 수 있어, 화면 복귀 시 즉시 보정
    const resync = () => {
      if (document.hidden) return
      setToday(todayKST())
      clearTimeout(timer)
      schedule()
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [])

  return today
}
