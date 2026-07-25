'use client'

import { useEffect } from 'react'

// 서비스워커 등록만 담당한다. 렌더 출력 없음.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* 등록 실패해도 앱 동작에는 지장 없음 */ })
  }, [])

  return null
}
