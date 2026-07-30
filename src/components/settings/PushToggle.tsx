'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useActor } from '@/components/approval/ActorPicker'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * 결재 알림(웹푸시) 켜기 토글.
 *
 * 구독을 어느 직원 앞으로 등록할지 알아야 하므로 useActor()로 "현재 직원"을 가져온다.
 * 결재 화면(ActorPicker)과 같은 localStorage 값을 공유하므로, 결재 화면에서
 * 이미 직원을 골랐다면 여기서도 그대로 이어받는다. 아직 안 골랐다면 먼저
 * 결재 화면에서 선택하도록 안내한다 — 여기 새 선택 UI를 또 만들지 않는다.
 */
export default function PushToggle() {
  const { actorId } = useActor()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'info' | 'error'>('info')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setOn(!!sub))
      .catch(() => {})
  }, [])

  const enable = async () => {
    if (!actorId) {
      setMsgType('error')
      setMsg('먼저 결재 화면에서 현재 직원을 선택해 주세요')
      return
    }

    setBusy(true)
    setMsg(null)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setMsgType('error')
        setMsg('이 브라우저는 알림을 지원하지 않습니다')
        return
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        setMsgType('error')
        setMsg('서버에 알림 설정이 완료되지 않았습니다')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setMsgType('error')
        setMsg('브라우저에서 알림을 차단했습니다. 사이트 설정에서 허용해 주세요')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const json = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
          actor_staff_id: actorId,
        }),
      })

      if (!res.ok) {
        setMsgType('error')
        setMsg('등록에 실패했습니다')
        return
      }
      setOn(true)
      setMsgType('info')
      setMsg('알림이 켜졌습니다')
    } catch {
      setMsgType('error')
      setMsg('알림 등록 중 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-border-primary rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {on ? <Bell size={16} className="text-txt-tertiary" /> : <BellOff size={16} className="text-txt-tertiary" />}
          <span className="text-sm text-txt-primary">결재 알림</span>
        </div>
        <button
          onClick={enable}
          disabled={busy || on}
          className="px-3 py-1.5 text-xs border border-border-primary rounded-lg disabled:opacity-40 text-txt-primary"
        >
          {on ? '켜짐' : busy ? '설정 중' : '알림 켜기'}
        </button>
      </div>
      <p className="mt-2 text-xs text-txt-tertiary">
        결재 요청·승인·반려를 휴대폰으로 받습니다.
        아이폰은 사파리 탭이 아니라 <span className="font-medium">공유 → 홈 화면에 추가</span>로 설치한 뒤에만 알림이 옵니다.
      </p>
      {msg && (
        <p className={`mt-1.5 text-xs ${msgType === 'error' ? 'text-danger' : 'text-accent-text'}`}>{msg}</p>
      )}
    </div>
  )
}
