import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendMessage,
  getFile,
  downloadFile,
  answerCallbackQuery,
  type TelegramUpdate,
  type TelegramMessage,
  type SendMessageOptions,
} from '@/lib/telegram/bot'
import {
  buildMorningBrief,
  buildAfternoonRemind,
  buildEveningRecap,
} from '@/lib/notifications/digest'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ============================================
// 사진 임시 캐시 (그룹에서 사진 → 텍스트 따로 보낼 때)
// ============================================
interface PendingPhoto {
  photos: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>[]
  chatId: number
  timestamp: number
}
const pendingPhotosCache = new Map<string, PendingPhoto>()

// 5분 만료 정리
function cleanExpiredPhotos() {
  const now = Date.now()
  for (const [key, val] of pendingPhotosCache) {
    if (now - val.timestamp > 5 * 60 * 1000) {
      pendingPhotosCache.delete(key)
    }
  }
}

// ============================================
// 사진 카테고리 파싱
// ============================================
function parseCategoryFromText(text: string): string {
  if (/시공\s*전/.test(text)) return 'before'
  if (/시공\s*중/.test(text)) return 'during'
  if (/시공\s*후/.test(text)) return 'after'
  if (/실측/.test(text)) return 'survey'
  if (/동의서/.test(text)) return 'consent'
  return 'etc'
}

// ============================================
// 입금 파싱 (금액 + 이름)
// ============================================
function parseDeposit(text: string): { amount: number; name: string | null; account: string | null } | null {
  let amount: number | null = null
  let name: string | null = null
  let account: string | null = null

  // 통장 구분: 169*** = 법인(기업은행), 302*** = 개인(농협)
  if (text.includes('169***') || (text.includes('기업') && !text.includes('기업체'))) {
    account = '법인 (기업은행)'
  } else if (text.includes('302-') || text.includes('302****') || text.includes('농협')) {
    account = '개인 (농협)'
  }

  // 날짜/시간/계좌번호 패턴 제거 (금액으로 오인 방지)
  const cleaned = text
    .replace(/\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}/g, '')  // 2026/04/16, 2026-04-16
    .replace(/\d{2}:\d{2}/g, '')                        // 18:06
    .replace(/\d{3}\*{2,}\d{4,}/g, '')                  // 169***52204018 (계좌)
    .replace(/\d{3}-\d{4}-\d{4}/g, '')                  // 010-1234-5678 (전화)

  // 금액 패턴: "입금 600,000원" 근처에서 찾기
  const depositLineMatch = cleaned.match(/입금\s*(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/)
  if (depositLineMatch) {
    amount = parseInt(depositLineMatch[1].replace(/,/g, ''), 10)
  }

  // 만원 패턴
  if (amount === null) {
    const manPattern = /(\d+(?:\.\d+)?)\s*만\s*원?/
    const manMatch = cleaned.match(manPattern)
    if (manMatch) {
      amount = Math.round(parseFloat(manMatch[1]) * 10000)
    }
  }

  // 일반 금액 패턴 (입금 키워드 없이)
  if (amount === null) {
    const numPattern = /₩?\s*(\d{1,3}(?:,\d{3})+)\s*원/
    const numMatch = cleaned.match(numPattern)
    if (numMatch) {
      amount = parseInt(numMatch[1].replace(/,/g, ''), 10)
    }
  }

  if (amount === null || amount <= 0 || amount < 10000) return null  // 1만원 미만은 무시

  // 이름 패턴: 한글 2~4글자
  const namePattern = /([가-힣]{2,4})/g
  const nameMatches = text.match(namePattern)
  if (nameMatches) {
    // 키워드 제외
    const excludeWords = ['입금', '수금', '착수금', '잔금', '추가', '공사', '시공전', '시공중', '시공후', '실측', '동의서', '만원', '발신', '기업', '본점', '농협', '국민', '신한', '우리', '하나', '알림']
    const candidates = nameMatches.filter(n => !excludeWords.includes(n) && n.length >= 2 && n.length <= 4)
    if (candidates.length > 0) {
      name = candidates[0]
    }
  }

  return { amount, name, account }
}

// ============================================
// 입금 키워드 감지
// ============================================
function hasDepositKeyword(text: string): boolean {
  return /입금|수금|착수금|잔금|결제/.test(text)
}

// POST /api/telegram/webhook
export async function POST(req: NextRequest) {
  // 웹훅 보안 토큰 검증
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token')
    if (incomingSecret !== expectedSecret) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const update = (await req.json()) as TelegramUpdate

  try {
    // ── 1. 콜백 쿼리 (인라인 버튼 클릭) ──
    if (update.callback_query) {
      await handleCallback(update.callback_query)
      return Response.json({ ok: true })
    }

    // ── 2. 메시지 처리 ──
    const message = update.message || update.edited_message
    if (!message) return Response.json({ ok: true })

    const chatType = message.chat.type || 'private'

    if (chatType === 'private') {
      // ── DM: 기존 로직 ──
      await handlePrivateMessage(message)
    } else if (chatType === 'group' || chatType === 'supergroup') {
      // ── 그룹 메시지 ──
      await handleGroupMessage(message)
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[telegram webhook] error:', e)
    return Response.json({ ok: true }) // 200 반환해야 텔레그램이 재전송 안 함
  }
}

// ============================================
// DM 메시지 (기존 로직 유지)
// ============================================
async function handlePrivateMessage(message: TelegramMessage) {
  const chatId = message.chat.id
  const text = (message.text || '').trim()

  if (!text) return // DM에서 사진만 보내면 무시 (향후 확장 가능)

  // 1. /start CODE
  if (text.startsWith('/start')) {
    await handleStart(chatId, text, message.from?.id)
    return
  }

  // 2. 연결된 staff 조회
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, name')
    .eq('telegram_chat_id', String(chatId))
    .maybeSingle()

  if (!staff) {
    await sendMessage(
      chatId,
      '아직 연결되지 않은 계정입니다.\n\n관리자에게 초대 코드를 받아 `/start CODE` 형식으로 입력해주세요.',
    )
    return
  }

  // 3. 슬래시 명령어
  if (text.startsWith('/')) {
    await handleCommand(chatId, staff.id, text)
    return
  }

  // 4. 자유 텍스트 → Claude
  await handleFreeText(chatId, staff.id, text)
}

// ============================================
// 그룹 메시지 처리
// ============================================
async function handleGroupMessage(message: TelegramMessage) {
  const chatId = message.chat.id
  const text = (message.text || message.caption || '').trim()
  const fromId = message.from?.id

  // /start CODE 처리 (그룹에서도 연결 가능)
  if (message.text?.startsWith('/start')) {
    await handleStart(chatId, message.text.trim(), fromId)
    return
  }

  // 보낸 사람의 staff 조회 (telegram_user_id 기반)
  let staff: { id: string; name: string } | null = null
  if (fromId) {
    const { data } = await supabaseAdmin
      .from('staff')
      .select('id, name')
      .eq('telegram_user_id', String(fromId))
      .maybeSingle()
    staff = data
  }

  // staff 미확인 → 조용히 무시 (그룹에서 에러 메시지 안 보냄)
  if (!staff) return

  cleanExpiredPhotos()

  const hasPhotos = message.photo && message.photo.length > 0

  // ── 사진만 (캡션 없음) → 캐시에 대기 ──
  if (hasPhotos && !text) {
    const key = staff.id
    const existing = pendingPhotosCache.get(key)
    if (existing) {
      existing.photos.push(message.photo!)
      existing.timestamp = Date.now()
    } else {
      pendingPhotosCache.set(key, {
        photos: [message.photo!],
        chatId,
        timestamp: Date.now(),
      })
    }
    return
  }

  // ── 사진 + 캡션 → 바로 업로드 ──
  if (hasPhotos && text) {
    await handlePhotoUpload(chatId, staff, [message.photo!], text)
    return
  }

  // ── 텍스트만 ──
  if (text) {
    // 대기 중인 사진이 있으면 결합
    const pending = pendingPhotosCache.get(staff.id)
    if (pending) {
      pendingPhotosCache.delete(staff.id)
      await handlePhotoUpload(chatId, staff, pending.photos, text)
      return
    }

    // 입금 키워드 감지
    if (hasDepositKeyword(text)) {
      await handleDepositMatch(chatId, staff, text)
      return
    }

    // @멘션 또는 /command → 일반 처리 (그룹에서 봇 명령어)
    if (text.startsWith('/')) {
      await handleCommand(chatId, staff.id, text)
      return
    }

    // 그 외 그룹 메시지는 무시 (모든 대화에 반응하지 않음)
  }
}

// ============================================
// 콜백 쿼리 처리 (인라인 버튼 클릭)
// ============================================
async function handleCallback(query: TelegramUpdate['callback_query']) {
  if (!query) return

  const data = query.data || ''
  const chatId = query.message?.chat.id

  // deposit:cancel
  if (data === 'deposit:cancel') {
    await answerCallbackQuery(query.id, '취소되었습니다')
    if (chatId) {
      await sendMessage(chatId, '수금 처리가 취소되었습니다.')
    }
    return
  }

  // deposit:{projectId}:{amount}
  if (data.startsWith('deposit:')) {
    const parts = data.split(':')
    if (parts.length < 3) {
      await answerCallbackQuery(query.id, '잘못된 데이터')
      return
    }
    const projectId = parts[1]
    const amount = parseInt(parts[2], 10)

    if (!projectId || isNaN(amount) || amount <= 0) {
      await answerCallbackQuery(query.id, '잘못된 데이터')
      return
    }

    // staff 조회
    const fromId = query.from.id
    const { data: staff } = await supabaseAdmin
      .from('staff')
      .select('id, name')
      .eq('telegram_user_id', String(fromId))
      .maybeSingle()

    try {
      // 중복 방지: 같은 project + 같은 금액 + 오늘 날짜로 이미 처리됐는지
      const today = new Date().toISOString().slice(0, 10)
      const { data: dup } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('project_id', projectId)
        .eq('amount', amount)
        .eq('payment_date', today)
        .eq('note', '텔레그램 수금 처리')
        .limit(1)

      if (dup && dup.length > 0) {
        await answerCallbackQuery(query.id, '이미 처리된 입금입니다')
        return
      }

      // 입금 기록 INSERT
      await supabaseAdmin.from('payments').insert({
        project_id: projectId,
        payment_type: '입금',
        amount,
        payment_date: today,
        payer_name: staff?.name || '텔레그램',
        note: '텔레그램 수금 처리',
      })

      // 프로젝트 상세 정보 조회 (cities, work_types 포함)
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select(`
          id, building_name, owner_name, road_address, jibun_address,
          water_work_type, support_program, note,
          total_cost, collected, outstanding, self_pay, city_support, additional_cost,
          cities(name),
          work_types(name, work_categories(name))
        `)
        .eq('id', projectId)
        .single()

      if (project) {
        const newOutstanding = Math.max(0, (project.outstanding || 0) - amount)
        const newCollected = (project.collected || 0) + amount
        await supabaseAdmin
          .from('projects')
          .update({ outstanding: newOutstanding, collected: newCollected })
          .eq('id', projectId)

        await answerCallbackQuery(query.id, '수금 처리 완료!')
        if (chatId) {
          const won = (n: number | null | undefined) => ((n || 0)).toLocaleString('ko-KR') + '원'
          const cityName = (project.cities as { name?: string } | null)?.name || '-'
          const category = (project.work_types as { work_categories?: { name?: string } } | null)?.work_categories?.name || '-'
          const workType = (project.work_types as { name?: string } | null)?.name || '-'
          const waterType = project.water_work_type ? ` (${project.water_work_type})` : ''
          const addr = project.road_address || project.jibun_address || '-'
          const supportProgram = project.support_program || workType
          const note = project.note || '-'

          const msg = [
            `✅ *입금 등록 완료*`,
            ``,
            `🏢 *${project.building_name || '(이름없음)'}*`,
            `📍 ${cityName} · ${addr}`,
            `🔧 ${category} · ${supportProgram}${waterType}`,
            `💬 ${note}`,
            ``,
            `━━━━━━━━━━━━━━━━`,
            `자부담금   ${won(project.self_pay)}`,
            `시지원금   ${won(project.city_support)}`,
            `추가공사금 ${won(project.additional_cost)}`,
            `총공사비   *${won(project.total_cost)}*`,
            `━━━━━━━━━━━━━━━━`,
            `수금액     ${won(newCollected)} ← +${won(amount)}`,
            `*미수금     ${won(newOutstanding)}*`,
          ].join('\n')

          await sendMessage(chatId, msg)
        }
      } else {
        await answerCallbackQuery(query.id, '프로젝트를 찾을 수 없습니다')
      }
    } catch (e) {
      console.error('[telegram callback] deposit error:', e)
      await answerCallbackQuery(query.id, '처리 중 오류 발생')
    }
    return
  }

  // 알 수 없는 콜백
  await answerCallbackQuery(query.id)
}

// ============================================
// 사진 업로드 처리
// ============================================
async function handlePhotoUpload(
  chatId: number,
  staff: { id: string; name: string },
  photoArrays: Array<Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>>,
  text: string,
) {
  const category = parseCategoryFromText(text)

  // 프로젝트 매칭: 텍스트에서 건물명/주소/소유자 검색
  const project = await matchProjectFromText(text)

  if (!project) {
    await sendMessage(chatId, `사진을 받았지만 매칭되는 프로젝트를 찾지 못했습니다.\n건물명이나 소유자명을 포함해주세요.`)
    return
  }

  let uploaded = 0
  for (const photos of photoArrays) {
    // 가장 큰 사진 (마지막 요소 = 최고 해상도)
    const largest = photos[photos.length - 1]
    if (!largest) continue

    try {
      const fileInfo = await getFile(largest.file_id)
      if (!fileInfo?.file_path) continue

      const buffer = await downloadFile(fileInfo.file_path)
      if (!buffer) continue

      // Supabase Storage에 업로드
      const timestamp = Date.now()
      const storagePath = `projects/${project.id}/${category}/${timestamp}.jpg`

      const { error } = await supabaseAdmin.storage
        .from('documents')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (!error) uploaded++
    } catch (e) {
      console.error('[telegram] photo upload error:', e)
    }
  }

  if (uploaded > 0) {
    const categoryNames: Record<string, string> = {
      before: '시공전', during: '시공중', after: '시공후',
      survey: '실측', consent: '동의서', etc: '기타',
    }
    await sendMessage(
      chatId,
      `*사진 ${uploaded}장 업로드 완료*\n` +
      `프로젝트: ${project.building_name || project.owner_name || ''}\n` +
      `분류: ${categoryNames[category] || category}`,
    )
  } else {
    await sendMessage(chatId, '사진 업로드에 실패했습니다. 다시 시도해주세요.')
  }
}

// ============================================
// 텍스트에서 프로젝트 매칭
// ============================================
async function matchProjectFromText(text: string): Promise<{
  id: string
  building_name: string | null
  owner_name: string | null
  road_address: string | null
} | null> {
  // 텍스트에서 한글 키워드 추출 (2글자 이상)
  const keywords = text.match(/[가-힣]{2,}/g)
  if (!keywords || keywords.length === 0) return null

  // 제외 키워드
  const excludeWords = ['입금', '수금', '착수금', '잔금', '추가', '공사', '시공전', '시공중', '시공후', '실측', '동의서', '만원', '사진', '업로드']

  const searchTerms = keywords.filter(k => !excludeWords.includes(k))
  if (searchTerms.length === 0) return null

  // 건물명으로 검색
  for (const term of searchTerms) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, road_address')
      .ilike('building_name', `%${term}%`)
      .neq('status', '취소')
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // 소유자명으로 검색
  for (const term of searchTerms) {
    if (term.length < 2 || term.length > 4) continue
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, road_address')
      .ilike('owner_name', `%${term}%`)
      .neq('status', '취소')
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // 주소로 검색
  for (const term of searchTerms) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, road_address')
      .ilike('road_address', `%${term}%`)
      .neq('status', '취소')
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  return null
}

// ============================================
// 입금 매칭
// ============================================
async function handleDepositMatch(
  chatId: number,
  staff: { id: string; name: string },
  text: string,
) {
  const deposit = parseDeposit(text)
  if (!deposit) {
    console.log('[deposit] parseDeposit returned null for:', text.slice(0, 100))
    return
  }

  console.log('[deposit] parsed:', JSON.stringify(deposit))

  // 이름으로 프로젝트 검색
  let matchedProjects: Array<{
    id: string
    building_name: string | null
    owner_name: string | null
    payer_name: string | null
    outstanding: number
  }> = []

  if (deposit.name) {
    const { data: byOwner, error: ownerErr } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, payer_name, outstanding, self_pay, city_support, total_cost, water_work_type, additional_cost, collected')
      .ilike('owner_name', `%${deposit.name}%`)
      .neq('status', '취소')
      .neq('status', '입금')
      .limit(5)

    console.log('[deposit] byOwner:', byOwner?.length, 'err:', ownerErr?.message)

    const { data: byPayer, error: payerErr } = await supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, payer_name, outstanding, self_pay, city_support, total_cost, water_work_type, additional_cost, collected')
      .ilike('payer_name', `%${deposit.name}%`)
      .neq('status', '취소')
      .neq('status', '입금')
      .limit(5)

    console.log('[deposit] byPayer:', byPayer?.length, 'err:', payerErr?.message)

    // 중복 제거
    const seen = new Set<string>()
    for (const p of [...(byOwner || []), ...(byPayer || [])]) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        matchedProjects.push(p)
      }
    }
  }

  if (matchedProjects.length === 0) {
    // 이름 매칭 실패 → 텍스트에서 프로젝트 매칭 시도
    const project = await matchProjectFromText(text)
    if (project) {
      const { data: full } = await supabaseAdmin
        .from('projects')
        .select('id, building_name, owner_name, payer_name, outstanding, self_pay, city_support, total_cost, water_work_type, additional_cost')
        .eq('id', project.id)
        .gt('outstanding', 0)
        .maybeSingle()
      if (full) matchedProjects = [full]
    }
  }

  if (matchedProjects.length === 0) {
    await sendMessage(
      chatId,
      `입금 ${deposit.amount.toLocaleString('ko-KR')}원 확인\n입금자: ${deposit.name || '미확인'}\n통장: ${deposit.account || '미확인'}\n\n매칭되는 현장을 찾지 못했습니다.\n현장명을 알려주시면 수금 처리하겠습니다.`,
    )
    return
  }

  // 매칭된 프로젝트별 상세 분석 + 인라인 버튼
  for (const p of matchedProjects) {
    const buildingName = p.building_name || '프로젝트'
    const formatted = deposit.amount.toLocaleString('ko-KR')
    const selfPay = (p as Record<string, unknown>).self_pay as number || 0
    const citySupport = (p as Record<string, unknown>).city_support as number || 0
    const additionalCost = (p as Record<string, unknown>).additional_cost as number || 0
    const waterType = (p as Record<string, unknown>).water_work_type as string || ''

    // 입금 유형 추정 (자부담/시지원/추가공사비 대조)
    const collected = (p as Record<string, unknown>).collected as number || 0
    const depositTypes: string[] = []
    if (selfPay > 0 && deposit.amount === selfPay) depositTypes.push('자부담금 일치')
    if (citySupport > 0 && deposit.amount === citySupport) depositTypes.push('시지원금 일치')
    if (additionalCost > 0 && deposit.amount === additionalCost) depositTypes.push('추가공사금 일치')
    if (selfPay > 0 && deposit.amount < selfPay && depositTypes.length === 0) depositTypes.push('자부담 일부')
    if (depositTypes.length === 0) depositTypes.push('기타 입금')
    const depositType = depositTypes.join(' / ')

    const lines = [
      `*입금 감지*`,
      `${buildingName}${waterType ? ` (${waterType})` : ''}`,
      `소유주: ${p.owner_name || '-'}`,
      `통장: ${deposit.account || '미확인'}`,
      ``,
      `입금액: *${formatted}원*`,
      `유형: ${depositType}`,
      ``,
      `자부담: ${selfPay.toLocaleString('ko-KR')}원 / 시지원: ${citySupport.toLocaleString('ko-KR')}원${additionalCost > 0 ? ` / 추가: ${additionalCost.toLocaleString('ko-KR')}원` : ''}`,
      `수금현황: ${collected.toLocaleString('ko-KR')}원 수금 / ${(p.outstanding || 0).toLocaleString('ko-KR')}원 미수`,
    ]

    // 여러 건 매칭 경고
    if (matchedProjects.length > 1) {
      lines.push(`\n⚠️ 동일 이름 ${matchedProjects.length}건 매칭 — 확인 후 처리`)
    }

    const opts: SendMessageOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `수금 처리 (${formatted}원)`, callback_data: `deposit:${p.id}:${deposit.amount}` },
            { text: '취소', callback_data: 'deposit:cancel' },
          ],
        ],
      },
    }

    await sendMessage(chatId, lines.join('\n'), opts)
  }
}

// ============================================
// /start CODE — 초대 코드 매칭
// ============================================
async function handleStart(chatId: number, text: string, fromUserId?: number) {
  const code = text.replace('/start', '').trim().toUpperCase()

  if (!code) {
    await sendMessage(
      chatId,
      `*다우건설 ERP 알리미*\n\n` +
      `연결하려면 관리자가 전달한 초대 코드를 입력하세요:\n` +
      `\`/start 코드\`\n\n` +
      `예: \`/start D8F2K1\``,
    )
    return
  }

  // 이미 연결된 경우
  const { data: existing } = await supabaseAdmin
    .from('staff')
    .select('id, name')
    .eq('telegram_chat_id', String(chatId))
    .maybeSingle()
  if (existing) {
    // telegram_user_id도 저장 (기존 연결에 누락된 경우)
    if (fromUserId) {
      await supabaseAdmin
        .from('staff')
        .update({ telegram_user_id: String(fromUserId) })
        .eq('id', existing.id)
    }
    await sendMessage(
      chatId,
      `이미 *${existing.name}*님으로 연결되어 있습니다.\n/help 입력하면 명령어 목록이 보입니다.`,
    )
    return
  }

  // 초대 코드 조회
  const { data: invite, error: invErr } = await supabaseAdmin
    .from('staff_invitations')
    .select('*')
    .eq('code', code)
    .is('used_at', null)
    .maybeSingle()

  if (invErr || !invite) {
    await sendMessage(
      chatId,
      `유효하지 않거나 이미 사용된 초대 코드입니다.\n\n관리자에게 새 코드를 요청해주세요.`,
    )
    return
  }

  // 만료 확인
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await sendMessage(chatId, `만료된 초대 코드입니다. 관리자에게 새 코드를 요청해주세요.`)
    return
  }

  // staff 매칭
  let staffId = invite.used_by_staff_id
  let staffName = invite.name

  if (!staffId && invite.name) {
    const { data: matched } = await supabaseAdmin
      .from('staff')
      .select('id, name')
      .eq('name', invite.name)
      .maybeSingle()
    if (matched) {
      staffId = matched.id
      staffName = matched.name
    }
  }

  if (!staffId) {
    await sendMessage(
      chatId,
      `초대 코드는 유효하나 매칭되는 직원 정보가 없습니다.\n관리자에게 문의해주세요.`,
    )
    return
  }

  // 텔레그램 연결 저장 (chat_id + user_id 모두 저장)
  const updateFields: Record<string, string> = {
    telegram_chat_id: String(chatId),
    telegram_linked_at: new Date().toISOString(),
  }
  if (fromUserId) {
    updateFields.telegram_user_id = String(fromUserId)
  }
  await supabaseAdmin
    .from('staff')
    .update(updateFields)
    .eq('id', staffId)

  await supabaseAdmin
    .from('staff_invitations')
    .update({
      used_at: new Date().toISOString(),
      used_by_staff_id: staffId,
    })
    .eq('id', invite.id)

  await sendMessage(
    chatId,
    `*${staffName}님 연결 완료!*\n\n` +
    `이제 ERP 알림을 여기로 받습니다.\n` +
    `/help 입력하면 명령어 목록이 보입니다.`,
  )
}

// ============================================
// 슬래시 명령 처리
// ============================================
async function handleCommand(chatId: number, staffId: string, text: string) {
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+/, '') // @봇이름 제거
  const args = text.slice(text.split(/\s+/)[0].length).trim()

  switch (cmd) {
    case '/help':
      await sendMessage(chatId, HELP_TEXT)
      return
    case '/오늘':
    case '/today': {
      const msg = await buildMorningBrief(staffId)
      await sendMessage(chatId, msg || '오늘 예정된 일정/업무가 없습니다.')
      return
    }
    case '/이번주':
    case '/week': {
      const msg = await buildEveningRecap(staffId)
      await sendMessage(chatId, msg || '이번 주 예정이 없습니다.')
      return
    }
    case '/브리핑':
    case '/brief': {
      const msg = await buildMorningBrief(staffId)
      await sendMessage(chatId, msg || '현재 브리핑할 항목이 없습니다.')
      return
    }
    case '/마감':
    case '/deadline': {
      const msg = await buildAfternoonRemind(staffId)
      await sendMessage(chatId, msg || '오늘 마감 항목이 없습니다.')
      return
    }
    case '/끄기':
    case '/off':
      await supabaseAdmin.from('staff').update({ notify_telegram: false }).eq('id', staffId)
      await sendMessage(chatId, '알림이 일시 중단되었습니다. `/켜기`로 재개하세요.')
      return
    case '/켜기':
    case '/on':
      await supabaseAdmin.from('staff').update({ notify_telegram: true }).eq('id', staffId)
      await sendMessage(chatId, '알림이 재개되었습니다.')
      return
    default:
      await sendMessage(chatId, `알 수 없는 명령어입니다. /help 입력하면 명령어 목록이 보입니다.`)
  }
}

// ============================================
// 자유 텍스트 → Claude API
// ============================================
async function handleFreeText(chatId: number, staffId: string, text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await sendMessage(chatId, 'AI 키가 설정되지 않았습니다.')
    return
  }

  // 1. 사용자 메시지 저장
  try {
    await supabaseAdmin.from('chat_messages').insert({
      staff_id: staffId,
      role: 'user',
      content: text,
      channel: 'telegram',
    })
  } catch { /* graceful */ }

  // 2. 최근 대화 로드
  let history: Array<{ role: string; content: string }> = []
  try {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(10)
    history = (data || []).reverse()
  } catch { /* graceful */ }

  // 3. staff 정보
  const { data: staff } = await supabaseAdmin
    .from('staff').select('name, role').eq('id', staffId).maybeSingle()

  const systemPrompt = `당신은 다우건설 ERP AI 비서입니다. 텔레그램으로 대화 중입니다.
대화 상대: ${staff?.name || ''}님 (${staff?.role || ''})

## 원칙
- 간결하고 친근한 답변
- 한국어
- 한 문장이면 한 문장으로
- 모호하면 구체 질문

## 컨텍스트
- 다우건설은 경기도 15개 시 대상 정부 지원사업 접수/현장관리 회사
- 직원 6명, 텔레그램으로 자동 알림 + 양방향 AI 비서

## 할 수 있는 것
- 오늘 일정/업무 조회 → /오늘 명령 안내
- 브리핑 → /브리핑 명령 안내
- 마감 → /마감 명령 안내
- 자유 대화 → 여기서 직접 답변

※ 실제 DB 조회/등록이 필요한 요청은 "아직 슬래시 명령에서만 지원됩니다"라고 안내.
`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: history.length > 0
          ? history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          : [{ role: 'user', content: text }],
      }),
    })

    if (!res.ok) {
      await sendMessage(chatId, 'AI 응답 실패. 잠시 후 다시 시도해주세요.')
      return
    }
    const json = await res.json()
    const answer = json.content?.[0]?.text || '응답을 생성하지 못했습니다.'

    // 4. AI 응답 저장
    try {
      await supabaseAdmin.from('chat_messages').insert({
        staff_id: staffId,
        role: 'assistant',
        content: answer,
        channel: 'telegram',
      })
    } catch { /* graceful */ }

    // 5. 텔레그램 전송
    await sendMessage(chatId, answer)
  } catch (e) {
    console.error('[telegram freeText] Claude error:', e)
    await sendMessage(chatId, '일시적 오류가 발생했습니다.')
  }
}

const HELP_TEXT = `*다우건설 ERP 알리미 명령어*

*조회*
/오늘 — 오늘 일정/업무 요약
/이번주 — 이번 주 일정 미리보기
/브리핑 — AI 긴급 체크
/마감 — 오늘 마감 남은 것

*설정*
/끄기 — 알림 일시 중단
/켜기 — 알림 재개

*자유 대화*
궁금한 것을 자연어로 물어보세요.
예: "오늘 내 일정 뭐야?"
예: "신한빌라 상태 어때?"

자동 알림은 매일 08:30, 15:00, 18:00에 전송됩니다.`
