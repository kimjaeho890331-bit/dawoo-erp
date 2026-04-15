// ============================================
// 텔레그램 봇 래퍼 (fetch 직접 호출, 의존성 없음)
// ============================================

const API_BASE = 'https://api.telegram.org/bot'

function getToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null
}

export interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  disable_web_page_preview?: boolean
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>
  }
}

export interface TelegramMessage {
  message_id: number
  from?: { id: number; first_name: string; username?: string }
  chat: { id: number; type: string }
  date: number
  text?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: {
    id: string
    from: { id: number }
    data?: string
    message?: TelegramMessage
  }
}

/**
 * 텍스트 메시지 발송
 * 실패 시 null 반환 (토큰 없거나 네트워크 오류)
 */
export async function sendMessage(
  chatId: string | number,
  text: string,
  options: SendMessageOptions = {}
): Promise<TelegramMessage | null> {
  const token = getToken()
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN 미설정 — 발송 스킵')
    return null
  }
  try {
    const res = await fetch(`${API_BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'Markdown',
        disable_web_page_preview: options.disable_web_page_preview ?? false,
        reply_markup: options.reply_markup,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[telegram] sendMessage 실패:', res.status, err)
      return null
    }
    const json = await res.json()
    return json.result as TelegramMessage
  } catch (e) {
    console.error('[telegram] sendMessage 에러:', e)
    return null
  }
}

/**
 * 파일 첨부 발송 (Google Drive PDF 등)
 * Phase 3에서 사용
 */
export async function sendDocument(
  chatId: string | number,
  fileUrl: string,
  caption?: string
): Promise<TelegramMessage | null> {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}${token}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        document: fileUrl,
        caption: caption || undefined,
        parse_mode: 'Markdown',
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.result as TelegramMessage
  } catch {
    return null
  }
}

/**
 * 웹훅 URL 등록 (초기 설정용)
 */
export async function setWebhook(url: string, secretToken?: string): Promise<boolean> {
  const token = getToken()
  if (!token) return false
  try {
    const res = await fetch(`${API_BASE}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        drop_pending_updates: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 현재 봇 정보 조회 (연결 확인용)
 */
export async function getMe(): Promise<{ id: number; username: string; first_name: string } | null> {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}${token}/getMe`)
    if (!res.ok) return null
    const json = await res.json()
    return json.result
  } catch {
    return null
  }
}

/**
 * 메시지 이스케이프 (Markdown 특수문자 처리)
 */
export function escapeMarkdown(text: string): string {
  // Basic MarkdownV1 safe (Telegram Markdown is lenient)
  return text.replace(/([_*`\[])/g, '\\$1')
}
