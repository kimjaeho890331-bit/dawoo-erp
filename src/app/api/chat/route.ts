import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

export const maxDuration = 60

// --- Supabase admin client (서비스 키로 RLS 우회) ---
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- 외부 API 키 ---
const ADDRESS_API_KEY = process.env.ADDRESS_API_KEY!
const BUILDING_API_KEY = process.env.BUILDING_API_KEY!

// --- 시스템 프롬프트 (AGENT.md 기반) ---
const SYSTEM_PROMPT = `당신은 다우건설 ERP AI 비서입니다. 접수 등록, 현황 조회, 업무 안내를 수행합니다.

## 핵심 원칙
- AI가 주인공, 사람이 서브. 데이터 입력/조회를 AI가 직접 처리.
- 제공된 도구(tool)를 적극 활용하여 실제 DB에 등록/조회.
- 불필요한 질문 금지. 이미 알려준 정보 다시 묻지 않기.

## 접수 등록 흐름
사용자가 접수를 요청하면 (예: "고색동 888-98 신한빌라 301호 김재호 010-2004-4444 소규모 접수해줘"):
1. search_address로 주소 검색 → 도로명/지번주소 + 코드 확보
2. get_building_info로 건물정보 조회 (빌라명, 용도, 세대수, 사용승인일)
3. get_unit_info로 전유부 조회 (해당 호수의 전유면적)
4. register_project로 DB 등록
5. 등록 결과를 간결하게 요약

## 필수/선택 판단
- 필수: 주소(또는 빌라명+지번), 소유주, 연락처, 소규모/수도 구분
- 선택: 공사종류 세부항목 (미지정 시 기본값으로 등록, 나중에 수정 가능)
- 상담내역 없으면 "AI 접수"로 자동 기록

## 되묻기 규칙 (최소한만)
- 소규모/수도 구분 불가 → 반드시 물어보기
- 소유주 이름/연락처 없으면 → 물어보기
- 주소 검색 결과 여러 개 → 목록 보여주고 선택 요청
- 빌라명이 표제부와 다르면 → "정식 명칭은 'OO'입니다. 맞나요?" 확인
- 그 외 → 묻지 말고 바로 처리

## 공사종류 분류
- 소규모: 방수, 옥상방수, 새빛, 녹색, 공동주택, 기와, 도장, 계단, 담장, 기타
- 수도: 수도, 공용, 아파트수도, 아파트공용, 옥내

## 조회 기능
- "현황", "몇 건", "알려줘" → search_projects로 DB 조회
- 검색 결과를 표 형태로 간결하게 보여주기

## 대화 규칙
- 간결하고 핵심적으로 답변. 장황한 설명 금지.
- 등록 완료 시 입력된 정보만 깔끔하게 요약.
- 한국어로 답변.
- 관할 15개 시: 수원, 성남, 안양, 부천, 광명, 시흥, 안산, 군포, 의왕, 과천, 용인, 화성, 오산, 평택, 하남`

// --- 도구 정의 ---
const TOOLS = [
  {
    name: 'search_address',
    description: '도로명/지번 주소를 검색합니다. 키워드로 주소 목록을 반환합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '검색할 주소 키워드 (예: 고색동 888-98, 호계동 960)' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_building_info',
    description: '건축물대장 표제부 정보를 조회합니다 (빌라명, 용도, 세대수, 사용승인일).',
    input_schema: {
      type: 'object' as const,
      properties: {
        sigunguCd: { type: 'string', description: '시군구코드 5자리' },
        bjdongCd: { type: 'string', description: '법정동코드 5자리' },
        bun: { type: 'string', description: '번 (예: 888)' },
        ji: { type: 'string', description: '지 (예: 98, 없으면 0)' },
      },
      required: ['sigunguCd', 'bjdongCd', 'bun', 'ji'],
    },
  },
  {
    name: 'get_unit_info',
    description: '건축물대장 전유부(호별 전유면적)를 조회합니다. exposPubuseGbCd=1인 전유 데이터만 반환.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sigunguCd: { type: 'string', description: '시군구코드 5자리' },
        bjdongCd: { type: 'string', description: '법정동코드 5자리' },
        bun: { type: 'string', description: '번' },
        ji: { type: 'string', description: '지' },
        hoNm: { type: 'string', description: '특정 호수 필터 (예: 301호). 생략 시 전체 반환.' },
      },
      required: ['sigunguCd', 'bjdongCd', 'bun', 'ji'],
    },
  },
  {
    name: 'register_project',
    description: '접수대장에 새 프로젝트를 등록합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', enum: ['소규모', '수도'], description: '접수대장 분류' },
        building_name: { type: 'string', description: '빌라명' },
        road_address: { type: 'string', description: '도로명주소' },
        jibun_address: { type: 'string', description: '지번주소' },
        owner_name: { type: 'string', description: '소유주 이름' },
        owner_phone: { type: 'string', description: '소유주 연락처' },
        work_type_name: { type: 'string', description: '공사종류명 (예: 옥상방수, 수도)' },
        dong: { type: 'string', description: '동 (예: 가동)' },
        ho: { type: 'string', description: '호 (예: 301호)' },
        exclusive_area: { type: 'number', description: '전유면적 m2' },
        building_use: { type: 'string', description: '건물 용도 (예: 공동주택)' },
        unit_count: { type: 'number', description: '세대수' },
        approval_date: { type: 'string', description: '사용승인일 YYYY-MM-DD' },
        note: { type: 'string', description: '상담내역/메모' },
      },
      required: ['category', 'building_name', 'owner_name', 'owner_phone'],
    },
  },
  {
    name: 'search_projects',
    description: '접수대장에서 프로젝트를 검색합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '검색 키워드 (빌라명, 소유주 등)' },
        status: { type: 'string', description: '상태 필터 (문의, 접수, 승인, 완료, 취소)' },
        category: { type: 'string', enum: ['소규모', '수도'], description: '카테고리 필터' },
      },
    },
  },
]

// --- 도구 실행 함수들 ---

async function searchAddress(keyword: string): Promise<string> {
  const params = new URLSearchParams({
    confmKey: ADDRESS_API_KEY,
    keyword,
    currentPage: '1',
    countPerPage: '5',
    resultType: 'json',
  })
  try {
    const res = await fetch(`https://business.juso.go.kr/addrlink/addrLinkApi.do?${params}`)
    const data = await res.json()
    const results = data?.results?.juso || []
    if (results.length === 0) return JSON.stringify({ message: '검색 결과가 없습니다', results: [] })
    return JSON.stringify(
      results.map((j: Record<string, string>) => ({
        roadAddr: j.roadAddr,
        jibunAddr: j.jibunAddr,
        bdNm: j.bdNm || '',
        sigunguCd: j.admCd?.substring(0, 5),
        bjdongCd: j.admCd?.substring(5, 10),
        bun: j.lnbrMnnm,
        ji: j.lnbrSlno || '0',
      }))
    )
  } catch (err) {
    return JSON.stringify({ error: `주소 검색 실패: ${err}` })
  }
}

async function getBuildingInfo(input: Record<string, unknown>): Promise<string> {
  const { sigunguCd, bjdongCd, bun, ji } = input as Record<string, string>
  const params = new URLSearchParams({
    serviceKey: BUILDING_API_KEY,
    sigunguCd,
    bjdongCd,
    bun: String(bun).padStart(4, '0'),
    ji: String(ji || '0').padStart(4, '0'),
    _type: 'json',
    numOfRows: '1',
  })
  try {
    const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params}`)
    const data = await res.json()
    const items = data?.response?.body?.items?.item
    if (!items) return JSON.stringify({ error: '건축물대장 정보를 찾을 수 없습니다' })
    const item = Array.isArray(items) ? items[0] : items
    // 사용승인일 포맷
    let useAprDay = item.useAprDay?.toString().trim() || ''
    if (useAprDay.length === 8) {
      useAprDay = `${useAprDay.substring(0, 4)}-${useAprDay.substring(4, 6)}-${useAprDay.substring(6, 8)}`
    }
    return JSON.stringify({
      bldNm: item.bldNm || '',
      mainPurpsCdNm: item.mainPurpsCdNm || '',
      etcPurps: item.etcPurps || '',
      hhldCnt: item.hhldCnt || 0,
      useAprDay,
      strctCdNm: item.strctCdNm || '',
      grndFlrCnt: item.grndFlrCnt || 0,
      ugrndFlrCnt: item.ugrndFlrCnt || 0,
    })
  } catch (err) {
    return JSON.stringify({ error: `건축물대장 조회 실패: ${err}` })
  }
}

async function getUnitInfo(input: Record<string, unknown>): Promise<string> {
  const { sigunguCd, bjdongCd, bun, ji, hoNm } = input as Record<string, string>
  const params = new URLSearchParams({
    serviceKey: BUILDING_API_KEY,
    sigunguCd,
    bjdongCd,
    bun: String(bun).padStart(4, '0'),
    ji: String(ji || '0').padStart(4, '0'),
    _type: 'json',
    numOfRows: '200',
  })
  try {
    const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${params}`)
    const data = await res.json()
    const items = data?.response?.body?.items?.item
    if (!items) return JSON.stringify([])
    const list = Array.isArray(items) ? items : [items]
    // 전유(exposPubuseGbCd=1)만 필터
    let filtered = list
      .filter((i: Record<string, string>) => i.exposPubuseGbCd === '1')
      .map((i: Record<string, string>) => ({
        dongNm: i.dongNm?.trim() || '',
        hoNm: i.hoNm || '',
        area: parseFloat(i.area) || 0,
      }))
    // 특정 호수 필터
    if (hoNm) {
      const ho = hoNm.replace(/호$/, '')
      const matched = filtered.filter((u: { hoNm: string }) => {
        const uHo = u.hoNm.replace(/호$/, '')
        return uHo === ho
      })
      if (matched.length > 0) filtered = matched
    }
    return JSON.stringify(filtered)
  } catch (err) {
    return JSON.stringify({ error: `전유부 조회 실패: ${err}` })
  }
}

async function registerProject(input: Record<string, unknown>): Promise<string> {
  const {
    category, building_name, road_address, jibun_address,
    owner_name, owner_phone, work_type_name, dong, ho,
    exclusive_area, building_use, unit_count, approval_date, note,
  } = input as Record<string, string | number | undefined>

  try {
    // 1. work_type_id 조회
    let workTypeId: string | null = null
    const { data: workTypes } = await supabaseAdmin
      .from('work_types')
      .select('id, name, work_categories!inner(name)')
      .eq('work_categories.name', category as string)

    if (workTypes && workTypes.length > 0) {
      if (work_type_name) {
        const exact = workTypes.find((t: { name: string }) => t.name === work_type_name)
        const partial = workTypes.find((t: { name: string }) =>
          t.name.includes(work_type_name as string) || (work_type_name as string).includes(t.name)
        )
        workTypeId = exact?.id || partial?.id || workTypes[0].id
      } else {
        workTypeId = workTypes[0].id
      }
    }

    // 2. city_id 조회 (주소에서 시 추출)
    let cityId: string | null = null
    const cityNames = ['수원', '성남', '안양', '부천', '광명', '시흥', '안산', '군포', '의왕', '과천', '용인', '화성', '오산', '평택', '하남']
    const addr = `${road_address || ''} ${jibun_address || ''}`
    const matchedCity = cityNames.find(c => addr.includes(c))
    if (matchedCity) {
      const { data: cityData } = await supabaseAdmin
        .from('cities')
        .select('id')
        .eq('name', matchedCity)
        .single()
      cityId = cityData?.id || null
    }

    // 3. 기본 담당자 (첫 번째 직원)
    const { data: defaultStaff } = await supabaseAdmin
      .from('staff')
      .select('id')
      .order('name')
      .limit(1)
      .single()

    // 4. DB 등록
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        building_name: building_name || '',
        road_address: road_address || null,
        jibun_address: jibun_address || null,
        owner_name: owner_name || '',
        owner_phone: owner_phone || '',
        dong: dong || null,
        ho: ho || null,
        exclusive_area: exclusive_area ? Number(exclusive_area) : null,
        building_use: building_use || null,
        unit_count: unit_count ? Number(unit_count) : null,
        approval_date: approval_date || null,
        note: (note as string) || 'AI 비서 접수',
        work_type_id: workTypeId,
        staff_id: defaultStaff?.id || null,
        city_id: cityId,
        status: '문의',
        year: new Date().getFullYear(),
      })
      .select('id, building_name, owner_name, status')

    if (error) return JSON.stringify({ error: `등록 실패: ${error.message}` })
    return JSON.stringify({ success: true, project: data?.[0], city: matchedCity })
  } catch (err) {
    return JSON.stringify({ error: `등록 실패: ${err}` })
  }
}

async function searchProjects(input: Record<string, unknown>): Promise<string> {
  const { keyword, status, category } = input as Record<string, string | undefined>
  try {
    let query = supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, owner_phone, road_address, status, note, work_types(name, work_categories(name))')

    if (status) query = query.eq('status', status)
    if (keyword) {
      const sanitized = (keyword as string).replace(/[%_\\]/g, '\\$&')
      query = query.or(`building_name.ilike.%${sanitized}%,owner_name.ilike.%${sanitized}%,road_address.ilike.%${sanitized}%`)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(10)
    if (error) return JSON.stringify({ error: error.message })

    // 카테고리 필터 (join 후 필터)
    let results = data || []
    if (category) {
      results = results.filter((p: Record<string, unknown>) => {
        const wt = p.work_types as Record<string, unknown> | null
        const wc = wt?.work_categories as Record<string, unknown> | null
        return wc?.name === category
      })
    }

    return JSON.stringify(
      results.map((p: Record<string, unknown>) => ({
        building_name: p.building_name,
        owner_name: p.owner_name,
        road_address: p.road_address,
        status: p.status,
        note: p.note,
      }))
    )
  } catch (err) {
    return JSON.stringify({ error: `조회 실패: ${err}` })
  }
}

// --- 도구 실행 라우터 ---
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_address':
      return searchAddress(input.keyword as string)
    case 'get_building_info':
      return getBuildingInfo(input)
    case 'get_unit_info':
      return getUnitInfo(input)
    case 'register_project':
      return registerProject(input)
    case 'search_projects':
      return searchProjects(input)
    default:
      return JSON.stringify({ error: `알 수 없는 도구: ${name}` })
  }
}

// --- API 핸들러 ---
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { messages } = await request.json()
    const recentMessages = (messages || []).slice(-20)

    // Claude API 메시지 형식으로 변환
    const claudeMessages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> =
      recentMessages.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }))

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const MAX_ITERATIONS = 8

          for (let i = 0; i < MAX_ITERATIONS; i++) {
            // Claude API 호출 (non-streaming, tool use 지원)
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                messages: claudeMessages,
                tools: TOOLS,
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('Claude API error:', response.status, errText)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: '오류가 발생했습니다. 다시 시도해주세요.' })}\n\n`))
              break
            }

            const result = await response.json()

            // 텍스트 블록 → 클라이언트로 스트림
            for (const block of result.content || []) {
              if (block.type === 'text' && block.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: block.text })}\n\n`))
              }
            }

            // 종료 조건
            if (result.stop_reason === 'end_turn' || result.stop_reason !== 'tool_use') {
              break
            }

            // tool_use → 도구 실행 → 결과를 메시지에 추가
            claudeMessages.push({ role: 'assistant', content: result.content })

            const toolResultBlocks: Array<Record<string, unknown>> = []
            for (const block of result.content || []) {
              if (block.type === 'tool_use') {
                console.log(`[AI Tool] ${block.name}:`, JSON.stringify(block.input).substring(0, 200))
                const toolResult = await executeTool(block.name, block.input as Record<string, unknown>)
                toolResultBlocks.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: toolResult,
                })
              }
            }

            claudeMessages.push({ role: 'user', content: toolResultBlocks })
          }
        } catch (err) {
          console.error('Chat stream error:', err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: '\n\n처리 중 오류가 발생했습니다.' })}\n\n`)
          )
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
