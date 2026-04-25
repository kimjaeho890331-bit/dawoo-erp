/**
 * 미니 토스트 시스템 — 의존성 없이 CustomEvent로 동작
 * 사용:
 *   import { toast } from '@/lib/toast'
 *   toast.success('완료')
 *   toast.error('실패: ...')
 *   toast.info('정보')
 */

export type ToastType = 'success' | 'error' | 'info'

export interface ToastPayload {
  id: string
  type: ToastType
  message: string
  duration?: number  // ms (기본 5000)
}

const EVENT_NAME = 'dawoo:toast'

function emit(type: ToastType, message: string, duration = 5000) {
  if (typeof window === 'undefined') return
  const detail: ToastPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    duration,
  }
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail }))
}

export const toast = {
  success: (msg: string, duration?: number) => emit('success', msg, duration),
  error: (msg: string, duration?: number) => emit('error', msg, duration ?? 8000),
  info: (msg: string, duration?: number) => emit('info', msg, duration),
}

export const TOAST_EVENT = EVENT_NAME
