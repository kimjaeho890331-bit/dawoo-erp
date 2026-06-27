// 어디서든 AI 비서 열기 — 선택적으로 질문을 미리 채워 자동 전송
// 사용: import { openAI } from '@/lib/openAI'; openAI('동의서 안 받은 접수 알려줘')
// AIAssistant가 'dawoo:open-ai' 이벤트를 수신해 팝업을 열고(있으면) 질문을 전송한다.
export const OPEN_AI_EVENT = 'dawoo:open-ai'

export function openAI(prompt?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_AI_EVENT, { detail: { prompt: prompt || '' } }))
}
