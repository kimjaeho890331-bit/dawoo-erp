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
- "수원 소규모 승인 몇건?" → city="수원", category="소규모", status_group="승인", count_only=true
- "수도공사는?" → 이전 대화 맥락에서 city 유지, category="수도"로 재조회
- 건수 질문 → count_only=true로 집계. 상태별 분포도 함께 제공.
- 목록 질문 → count_only=false로 상세 목록. 총 건수 + 상위 20건 반환.
- 검색 결과를 표 형태로 간결하게 보여주기
- 상태그룹: 접수(문의~신청서제출), 승인(승인~공사), 완료(완료서류제출+입금), 취소

## 접수 수정
- "소유주 변경", "연락처 수정" → search_projects로 먼저 찾고 → update_project로 수정
- 반드시 검색 → 확인 → 수정 순서

## 단계 변경
- "실측 완료", "견적 전달" → search_projects로 찾고 → update_status
- 변경 후 status_logs에 자동 기록됨

## 캘린더
- "일정 잡아줘" → manage_schedule(action=create)
- "이번 주 일정" → manage_schedule(action=search, search_date_from/to)
- 담당자 이름으로 staff_id 자동 매칭

## 지출
- "이번 달 노무비 얼마?" → manage_expense(action=summary, category=노무비)
- "지출 등록해줘" → manage_expense(action=create)

## 현장/거래처
- "진행중 현장" → search_sites(status=active)
- "방수 업체 찾아줘" → search_vendors(keyword=방수, vendor_type=협력업체)

## 복합 명령 처리
- "삼성빌리지 실측 완료하고 내일 견적 일정 잡아줘" → update_status + manage_schedule 순차 실행
- 여러 도구를 연달아 사용하여 한 번에 처리

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
    description: '접수대장에서 프로젝트를 검색/집계합니다. 건수, 현황, 목록 조회 모두 가능.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '검색 키워드 (빌라명, 소유주, 주소 등)' },
        status_group: { type: 'string', enum: ['진행중', '접수', '승인', '완료', '취소', '문의(예약)'], description: '상태 그룹 필터. 접수=문의~신청서제출, 승인=승인~공사, 완료=완료서류제출+입금' },
        city: { type: 'string', description: '도시 필터 (수원, 성남, 안양, 부천, 광명, 시흥, 안산, 군포, 의왕, 과천, 용인, 화성, 오산, 평택, 하남, 광주, 서산)' },
        category: { type: 'string', enum: ['소규모', '수도'], description: '카테고리 필터' },
        count_only: { type: 'boolean', description: '건수만 반환할지 여부. "몇건", "현황" 등 질문 시 true' },
      },
    },
  },
  // --- Phase A: 확장 도구 6개 ---
  {
    name: 'update_project',
    description: '접수대장 프로젝트 정보를 수정합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: '수정할 프로젝트 ID (search_projects로 먼저 조회)' },
        building_name: { type: 'string', description: '빌라명 변경' },
        owner_name: { type: 'string', description: '소유주명 변경' },
        owner_phone: { type: 'string', description: '소유주 연락처 변경' },
        tenant_phone: { type: 'string', description: '세입자 연락처' },
        note: { type: 'string', description: '상담내역/메모 변경' },
        staff_id: { type: 'string', description: '담당자 ID 변경' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'update_status',
    description: '접수대장 프로젝트의 단계(상태)를 변경합니다. 변경 이력이 자동 기록됩니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: '프로젝트 ID' },
        new_status: { type: 'string', enum: ['문의', '실측', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출', '입금', '취소', '문의(예약)'], description: '변경할 상태' },
        note: { type: 'string', description: '변경 사유 (선택)' },
      },
      required: ['project_id', 'new_status'],
    },
  },
  {
    name: 'manage_schedule',
    description: '캘린더 일정을 등록/조회/수정/삭제합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['create', 'search', 'update', 'delete'], description: '작업 종류' },
        schedule_id: { type: 'string', description: '수정/삭제 시 일정 ID' },
        title: { type: 'string', description: '일정 제목 (예: 권선동 실측)' },
        start_date: { type: 'string', description: '시작일 YYYY-MM-DD' },
        end_date: { type: 'string', description: '종료일 YYYY-MM-DD (미입력 시 시작일과 동일)' },
        start_time: { type: 'string', description: '시간 HH:MM (예: 10:00)' },
        staff_name: { type: 'string', description: '담당자 이름 (예: 김재호)' },
        schedule_type: { type: 'string', enum: ['project', 'personal', 'promo'], description: '일정 유형' },
        search_keyword: { type: 'string', description: '조회 시 검색 키워드' },
        search_staff: { type: 'string', description: '조회 시 담당자 이름' },
        search_date_from: { type: 'string', description: '조회 시작일' },
        search_date_to: { type: 'string', description: '조회 종료일' },
      },
      required: ['action'],
    },
  },
  {
    name: 'search_sites',
    description: '현장관리 정보를 조회합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '현장명 검색' },
        status: { type: 'string', enum: ['active', 'completed', 'all'], description: '상태 필터' },
      },
    },
  },
  {
    name: 'manage_expense',
    description: '지출결의서를 등록/조회/집계합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['create', 'search', 'summary'], description: '작업 종류' },
        category: { type: 'string', enum: ['노무비', '업체지출', '기타경비'], description: '분류' },
        title: { type: 'string', description: '지출 내용' },
        amount: { type: 'number', description: '금액' },
        expense_date: { type: 'string', description: '날짜 YYYY-MM-DD' },
        month: { type: 'string', description: '집계 시 월 YYYY-MM' },
      },
      required: ['action'],
    },
  },
  {
    name: 'search_vendors',
    description: '거래처(협력업체, 일용직)를 검색합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '이름/업종/연락처 검색' },
        vendor_type: { type: 'string', enum: ['협력업체', '일용직'], description: '거래처 유형' },
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

// 상태 그룹 → 실제 DB 상태값 매핑
const STATUS_GROUP_MAP: Record<string, string[]> = {
  '접수': ['문의', '실측', '견적전달', '동의서', '신청서제출'],
  '승인': ['승인', '착공계', '공사'],
  '완료': ['완료서류제출', '입금'],
  '취소': ['취소'],
  '문의(예약)': ['문의(예약)'],
  '진행중': ['문의', '실측', '견적전달', '동의서', '신청서제출', '승인', '착공계', '공사', '완료서류제출'],
}

async function searchProjects(input: Record<string, unknown>): Promise<string> {
  const { keyword, status_group, city, category, count_only } = input as Record<string, string | boolean | undefined>
  try {
    let query = supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, owner_phone, road_address, jibun_address, status, city_id, staff_id, note, cities(name), staff:staff_id(name), work_types(name, work_categories(name))')

    // 상태 그룹 필터
    if (status_group && STATUS_GROUP_MAP[status_group as string]) {
      query = query.in('status', STATUS_GROUP_MAP[status_group as string])
    }

    // 도시 필터
    if (city) {
      const { data: cityData } = await supabaseAdmin.from('cities').select('id').eq('name', `${city}시`).maybeSingle()
      if (!cityData) {
        const { data: cityData2 } = await supabaseAdmin.from('cities').select('id').ilike('name', `%${city}%`).maybeSingle()
        if (cityData2) query = query.eq('city_id', cityData2.id)
      } else {
        query = query.eq('city_id', cityData.id)
      }
    }

    // 키워드 검색
    if (keyword) {
      const sanitized = (keyword as string).replace(/[%_\\]/g, '\\$&')
      query = query.or(`building_name.ilike.%${sanitized}%,owner_name.ilike.%${sanitized}%,road_address.ilike.%${sanitized}%,jibun_address.ilike.%${sanitized}%`)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) return JSON.stringify({ error: error.message })

    // 카테고리 필터 (join 후)
    let results = data || []
    if (category) {
      results = results.filter((p: Record<string, unknown>) => {
        const wt = p.work_types as Record<string, unknown> | null
        const wc = wt?.work_categories as Record<string, unknown> | null
        return wc?.name === category
      })
    }

    // 건수만 반환
    if (count_only) {
      // 상태별 분포도 함께
      const statusCounts: Record<string, number> = {}
      results.forEach((p: Record<string, unknown>) => {
        const s = (p.status as string) || '미지정'
        statusCounts[s] = (statusCounts[s] || 0) + 1
      })
      return JSON.stringify({
        total: results.length,
        status_breakdown: statusCounts,
        filters: { city, category, status_group },
      })
    }

    // 목록 반환 (최대 20건)
    return JSON.stringify({
      total: results.length,
      projects: results.slice(0, 20).map((p: Record<string, unknown>) => {
        const staff = p.staff as Record<string, unknown> | null
        const cities = p.cities as Record<string, unknown> | null
        return {
          building_name: p.building_name,
          owner_name: p.owner_name,
          road_address: p.road_address || p.jibun_address,
          status: p.status,
          city: cities?.name || '',
          staff: staff?.name || '',
        }
      }),
    })
  } catch (err) {
    return JSON.stringify({ error: `조회 실패: ${err}` })
  }
}

// --- Phase A: 확장 도구 실행 함수들 ---

async function updateProject(input: Record<string, unknown>): Promise<string> {
  const { project_id, ...updates } = input as Record<string, string | undefined>
  if (!project_id) return JSON.stringify({ error: 'project_id 필수' })
  const payload: Record<string, unknown> = {}
  if (updates.building_name) payload.building_name = updates.building_name
  if (updates.owner_name) payload.owner_name = updates.owner_name
  if (updates.owner_phone) payload.owner_phone = updates.owner_phone
  if (updates.tenant_phone) payload.tenant_phone = updates.tenant_phone
  if (updates.note) payload.note = updates.note
  if (updates.staff_id) payload.staff_id = updates.staff_id
  if (Object.keys(payload).length === 0) return JSON.stringify({ error: '변경할 항목이 없습니다' })
  const { error } = await supabaseAdmin.from('projects').update(payload).eq('id', project_id)
  if (error) return JSON.stringify({ error: error.message })
  return JSON.stringify({ success: true, updated: Object.keys(payload) })
}

async function updateStatus(input: Record<string, unknown>): Promise<string> {
  const { project_id, new_status, note } = input as Record<string, string | undefined>
  if (!project_id || !new_status) return JSON.stringify({ error: 'project_id, new_status 필수' })
  const { data: prev } = await supabaseAdmin.from('projects').select('status, building_name').eq('id', project_id).single()
  if (!prev) return JSON.stringify({ error: '프로젝트를 찾을 수 없습니다' })
  const { error } = await supabaseAdmin.from('projects').update({ status: new_status }).eq('id', project_id)
  if (error) return JSON.stringify({ error: error.message })
  await supabaseAdmin.from('status_logs').insert({ project_id, from_status: prev.status, to_status: new_status, note: note || 'AI 비서 변경' })
  return JSON.stringify({ success: true, building: prev.building_name, from: prev.status, to: new_status })
}

async function manageSchedule(input: Record<string, unknown>): Promise<string> {
  const { action } = input as Record<string, string | undefined>
  if (action === 'create') {
    const { title, start_date, end_date, start_time, staff_name, schedule_type } = input as Record<string, string | undefined>
    if (!title || !start_date) return JSON.stringify({ error: 'title, start_date 필수' })
    let staffId = null
    if (staff_name) {
      const { data: s } = await supabaseAdmin.from('staff').select('id').ilike('name', `%${staff_name}%`).limit(1).single()
      if (s) staffId = s.id
    }
    const { data, error } = await supabaseAdmin.from('schedules').insert({
      title, start_date, end_date: end_date || start_date,
      start_time: start_time || null, staff_id: staffId,
      schedule_type: schedule_type || 'project', confirmed: false,
      all_day: !start_time, color: '#3B82F6',
    }).select('id, title, start_date')
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ success: true, schedule: data?.[0] })
  }
  if (action === 'search') {
    const { search_keyword, search_staff, search_date_from, search_date_to } = input as Record<string, string | undefined>
    let q = supabaseAdmin.from('schedules').select('id, title, start_date, end_date, start_time, confirmed, staff:staff_id(name)').neq('schedule_type', 'site')
    if (search_date_from) q = q.gte('start_date', search_date_from)
    if (search_date_to) q = q.lte('start_date', search_date_to)
    if (search_keyword) q = q.ilike('title', `%${search_keyword}%`)
    if (search_staff) {
      const { data: s } = await supabaseAdmin.from('staff').select('id').ilike('name', `%${search_staff}%`).limit(1).single()
      if (s) q = q.eq('staff_id', s.id)
    }
    const { data, error } = await q.order('start_date').limit(20)
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ total: data?.length || 0, schedules: data?.map((s: Record<string, unknown>) => ({ title: s.title, date: s.start_date, time: s.start_time, confirmed: s.confirmed, staff: (s.staff as Record<string, unknown>)?.name })) })
  }
  if (action === 'delete' && input.schedule_id) {
    const { error } = await supabaseAdmin.from('schedules').delete().eq('id', input.schedule_id as string)
    return error ? JSON.stringify({ error: error.message }) : JSON.stringify({ success: true })
  }
  return JSON.stringify({ error: '지원하지 않는 action' })
}

async function searchSites(input: Record<string, unknown>): Promise<string> {
  const { keyword, status } = input as Record<string, string | undefined>
  let q = supabaseAdmin.from('sites').select('id, name, address, status, start_date, end_date, budget, description')
  if (keyword) q = q.ilike('name', `%${keyword}%`)
  if (status === 'active') q = q.neq('status', 'completed')
  if (status === 'completed') q = q.eq('status', 'completed')
  const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
  if (error) return JSON.stringify({ error: error.message })
  return JSON.stringify({ total: data?.length || 0, sites: data })
}

async function manageExpense(input: Record<string, unknown>): Promise<string> {
  const { action } = input as Record<string, string | undefined>
  if (action === 'create') {
    const { category, title, amount, expense_date } = input as Record<string, string | number | undefined>
    if (!title || !amount) return JSON.stringify({ error: 'title, amount 필수' })
    const { data, error } = await supabaseAdmin.from('expenses').insert({
      category: category || '기타경비', title, amount: Number(amount),
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      status: '대기', approver: '관리자',
    }).select('id, title, amount')
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ success: true, expense: data?.[0] })
  }
  if (action === 'summary') {
    const { month, category } = input as Record<string, string | undefined>
    const targetMonth = month || new Date().toISOString().slice(0, 7)
    let q = supabaseAdmin.from('expenses').select('category, amount, expense_date')
      .gte('expense_date', `${targetMonth}-01`).lte('expense_date', `${targetMonth}-31`)
    if (category) q = q.eq('category', category)
    const { data, error } = await q
    if (error) return JSON.stringify({ error: error.message })
    const total = (data || []).reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0)
    const byCat: Record<string, number> = {}
    ;(data || []).forEach((e: Record<string, unknown>) => { byCat[e.category as string] = (byCat[e.category as string] || 0) + (Number(e.amount) || 0) })
    return JSON.stringify({ month: targetMonth, total, count: data?.length || 0, by_category: byCat })
  }
  if (action === 'search') {
    const { category, month } = input as Record<string, string | undefined>
    const targetMonth = month || new Date().toISOString().slice(0, 7)
    let q = supabaseAdmin.from('expenses').select('id, title, amount, category, expense_date, status, staff:staff_id(name)')
      .gte('expense_date', `${targetMonth}-01`).lte('expense_date', `${targetMonth}-31`)
    if (category) q = q.eq('category', category)
    const { data, error } = await q.order('expense_date', { ascending: false }).limit(30)
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ total: data?.length || 0, expenses: data })
  }
  return JSON.stringify({ error: '지원하지 않는 action' })
}

async function searchVendors(input: Record<string, unknown>): Promise<string> {
  const { keyword, vendor_type } = input as Record<string, string | undefined>
  let q = supabaseAdmin.from('vendors').select('id, name, vendor_type, phone, specialty, representative, bank_name, account_number, business_number')
  if (vendor_type) q = q.eq('vendor_type', vendor_type)
  if (keyword) q = q.or(`name.ilike.%${keyword}%,specialty.ilike.%${keyword}%,phone.ilike.%${keyword}%`)
  const { data, error } = await q.order('name').limit(20)
  if (error) return JSON.stringify({ error: error.message })
  return JSON.stringify({ total: data?.length || 0, vendors: data })
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
    case 'update_project':
      return updateProject(input)
    case 'update_status':
      return updateStatus(input)
    case 'manage_schedule':
      return manageSchedule(input)
    case 'search_sites':
      return searchSites(input)
    case 'manage_expense':
      return manageExpense(input)
    case 'search_vendors':
      return searchVendors(input)
    default:
      return JSON.stringify({ error: `알 수 없는 도구: ${name}` })
  }
}

// --- Non-streaming handler (텔레그램 및 기타 용도) ---
async function handleNonStreaming(
  apiKey: string,
  claudeMessages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
  staffId?: string,
  channel?: 'web' | 'telegram',
): Promise<Response> {
  const MAX_ITERATIONS = 8
  let finalText = ''

  for (let i = 0; i < MAX_ITERATIONS; i++) {
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
      return Response.json({ content: '오류가 발생했습니다.' }, { status: 500 })
    }

    const result = await response.json()
    for (const block of result.content || []) {
      if (block.type === 'text' && block.text) {
        finalText += block.text
      }
    }

    if (result.stop_reason === 'end_turn' || result.stop_reason !== 'tool_use') {
      break
    }

    claudeMessages.push({ role: 'assistant', content: result.content })
    const toolResultBlocks: Array<Record<string, unknown>> = []
    for (const block of result.content || []) {
      if (block.type === 'tool_use') {
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

  // assistant 응답 저장
  if (staffId && channel && finalText) {
    try {
      await supabaseAdmin.from('chat_messages').insert({
        staff_id: staffId,
        role: 'assistant',
        content: finalText,
        channel,
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) { /* graceful */ }
  }

  return Response.json({ content: finalText || '응답을 생성하지 못했습니다.' })
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
    const body = await request.json()
    const { messages, staffId, channel, nonStreaming } = body as {
      messages: Array<{ role: string; content: string }>
      staffId?: string
      channel?: 'web' | 'telegram'
      nonStreaming?: boolean
    }
    const recentMessages = (messages || []).slice(-20)

    // 대화 저장: staffId가 있으면 마지막 user 메시지 저장
    if (staffId && channel && recentMessages.length > 0) {
      const lastMsg = recentMessages[recentMessages.length - 1]
      if (lastMsg.role === 'user') {
        try {
          await supabaseAdmin.from('chat_messages').insert({
            staff_id: staffId,
            role: 'user',
            content: lastMsg.content,
            channel,
          })
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_e) { /* graceful: 테이블 없으면 스킵 */ }
      }
    }

    // Claude API 메시지 형식으로 변환
    const claudeMessages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> =
      recentMessages.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }))

    // non-streaming 모드 (텔레그램용): JSON 한 번에 반환
    if (nonStreaming) {
      return handleNonStreaming(apiKey, claudeMessages, staffId, channel)
    }

    const encoder = new TextEncoder()
    let streamedText = '' // assistant 최종 응답 누적 (저장용)
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
                streamedText += block.text
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
          // assistant 응답 저장 (웹 대화 기록)
          if (staffId && channel && streamedText) {
            try {
              await supabaseAdmin.from('chat_messages').insert({
                staff_id: staffId,
                role: 'assistant',
                content: streamedText,
                channel,
              })
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_e) { /* graceful */ }
          }
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
