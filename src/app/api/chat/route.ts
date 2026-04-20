import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { ensureProjectFolder, ensureSiteFolder, uploadFile, listFiles, testConnection } from '@/lib/google-drive'
import { applyDepositAndAdvanceStatus, formatDepositMessage } from '@/lib/payments'

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

## 현재 날짜
오늘: ${new Date().toISOString().slice(0, 10)} (${['일','월','화','수','목','금','토'][new Date().getDay()]}요일)

## 핵심 원칙
- AI가 주인공, 사람이 서브. 데이터 입력/조회를 AI가 직접 처리.
- 제공된 도구(tool)를 적극 활용하여 실제 DB에 등록/조회.
- 불필요한 질문 금지. 이미 알려준 정보 다시 묻지 않기.

## 자기소개
"뭐 할 수 있어?", "도움말", "기능" 등 질문 시 아래 기능을 간결하게 안내:
- 접수: 주소+소유주로 신규 접수 등록
- 조회: 접수 건수/목록/현황 조회
- 입금: 입금 문자 붙여넣기 → 자동 매칭+기록
- 일정: 캘린더 일정 등록/조회/수정
- 현장: 현장관리 조회
- 지출: 지출 등록/집계
- 거래처: 협력업체/일용직 검색
- 보고서: 일일/주간/월간 보고서 자동 생성
- 통계: 대시보드 실적 통계
- 기억: 회사 규칙/선호 학습
- 드라이브: 구글드라이브 폴더/사진 관리

## 중요: 다음 턴 대비 (컨텍스트 유실 방지)
후보 목록(주소/프로젝트/일정 등)을 사용자에게 보여줄 때,
관련 ID를 텍스트에 반드시 포함. 다음 턴에서 도구 결과가 유실될 수 있음.
검색 결과 표시 시 project_id, schedule_id 등을 [ID: xxx] 형태로 기재.
ID가 없는 상태에서 수정/삭제/입금 도구 호출 금지 → search_* 도구로 재검색.

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

## 캘린더 비서
- "일정 잡아줘" → manage_schedule(action=create)
- "이번 주 일정" → manage_schedule(action=search, search_date_from/to)
- 담당자 이름으로 staff_id 자동 매칭
- "내일 뭐 있어?" → 내일 날짜로 일정 조회
- "김재호 이번 주 일정" → staff + 날짜 조합 조회
- "다음 주 월요일 오전 10시 권선동 실측" → 날짜 계산해서 등록
- "오늘 일정 정리해줘" → 오늘 전체 일정 조회 + 요약
- "이번 달 홍보 일정 몇 건?" → schedule_type=promo 필터
- 일정 등록 시 시간 없으면 all_day=true, 있으면 start_time 포함
- 복합: "삼성빌리지 실측 완료하고 내일 견적 일정 잡아줘" → update_status + manage_schedule

## 지출
- "이번 달 노무비 얼마?" → manage_expense(action=summary, category=노무비)
- "지출 등록해줘" → manage_expense(action=create)

## 현장/거래처
- "진행중 현장" → search_sites(status=active)
- "방수 업체 찾아줘" → search_vendors(keyword=방수, vendor_type=협력업체)

## 복합 명령 처리
- "삼성빌리지 실측 완료하고 내일 견적 일정 잡아줘" → update_status + manage_schedule 순차 실행
- 여러 도구를 연달아 사용하여 한 번에 처리

## 통계/보고서
- "이번 달 실적" → get_dashboard_stats로 전체 현황 조회 후 요약
- "보고서 만들어줘" → generate_report로 데이터 수집 → 서술형 보고서 작성
- 보고서는 핵심 성과, 주요 변동, 주의사항을 포함하여 작성

## 활동로그
- "김재호 오늘 뭐 했어?" → get_activity_log(staff_name=김재호)
- "오늘 누가 뭐 했어?" → get_activity_log(date=오늘)

## AI 기억
- 사용자가 "방수는 A업체 써", "수원 실측은 김재호가 가" 등 규칙/선호를 말하면
  → manage_memory(action=save)로 저장하고 "기억했습니다" 응답
- 접수/일정 등록 시 관련 기억이 있으면 자동 참조하여 추천
- "뭐 기억하고 있어?" → manage_memory(action=list)

## 사진 저장
- 사용자가 사진을 첨부하고 "삼성빌리지 시공전 사진 저장해줘" → save_photo_to_drive
- photo_type: 실측/시공전/시공중/시공후
- 자동으로 프로젝트 폴더/사진/[유형]/ 에 저장
- 저장 완료 후 몇 장 저장됐는지 간결하게 응답

## 입금 처리 [매우 중요]
- 사용자가 "[Web발신]..." 같은 입금 문자를 붙여넣으면 반드시 이 순서:
  1. match_deposit(deposit_text) → 후보 목록 확인
  2. 후보 0건: "○○님 명의 프로젝트를 찾을 수 없습니다. 빌라명 알려주세요." → search_projects로 재검색
  3. 후보 1건: 바로 record_deposit 호출
  4. 후보 여러개: 목록에 반드시 project_id를 포함하여 표시. 형식:
     1. [ID: abc123] 삼성빌리지 (수원) - 미수금 500,000원
     2. [ID: def456] 현대빌라 (성남) - 미수금 300,000원
     "몇 번인가요?" → 선택 후 해당 ID로 record_deposit 호출
     ⚠️ project_id 없이 record_deposit 절대 호출 금지. ID를 모르면 search_projects로 재검색.
- record_deposit 호출 시:
  - project_id, amount는 필수
  - payer_name(입금자명)은 매칭된 이름 전달
  - confirmer_name은 생략 가능 (서버가 현재 사용자로 자동 주입)
  - payment_type은 서버가 금액 기준으로 자동 분류 (자부담착수금/추가공사비/시지원금잔금)
- record_deposit 결과의 formatted_message 필드를 그대로 사용자에게 보여주면 됨
  (별도 포맷 만들지 말고 formatted_message 그대로 전달)
- 오류 시 사용자에게 이유 설명 후 재시도 안내
- **절대 금액만으로 프로젝트 추측 금지.** 이름 매칭 안 되면 사용자에게 빌라명 요청.

## 구글드라이브
- "드라이브 연결 확인" → manage_drive(action=test)
- "삼성빌리지 폴더 만들어줘" → manage_drive(action=create_project_folder, city_name, category, building_name)
- "현장 폴더 만들어줘" → manage_drive(action=create_site_folder, site_name)
- 접수 등록 후 자동으로 프로젝트 폴더 생성 추천
- 폴더 구조: 다우건설/지원사업/[시]/[소규모|수도]/[빌라명]/

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
        search_type: { type: 'string', enum: ['project', 'personal', 'promo'], description: '일정 유형 필터' },
        memo: { type: 'string', description: '메모 (일정 등록 시)' },
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
  // --- Phase B: 분석 + 학습 도구 4개 ---
  {
    name: 'get_dashboard_stats',
    description: '이번 달 실적 통계를 요약합니다. 접수/완료/미수금/지출/현장 등 전체 현황.',
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'string', description: '조회할 월 YYYY-MM (기본: 이번 달)' },
      },
    },
  },
  {
    name: 'generate_report',
    description: '일일/주간/월간 업무 보고서를 자동 생성합니다. DB 데이터를 수집하여 서술형 분석.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: '보고서 유형' },
        date: { type: 'string', description: '기준일 YYYY-MM-DD (기본: 오늘)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_activity_log',
    description: '직원 활동 로그를 조회합니다. 누가 뭘 했는지 확인.',
    input_schema: {
      type: 'object' as const,
      properties: {
        staff_name: { type: 'string', description: '직원 이름' },
        date: { type: 'string', description: '조회할 날짜 YYYY-MM-DD' },
        action: { type: 'string', description: '특정 행동 필터 (project_created, status_changed 등)' },
      },
    },
  },
  {
    name: 'manage_memory',
    description: 'AI 기억을 저장/조회합니다. 회사 규칙, 선호, 패턴을 학습.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['save', 'search', 'list'], description: '작업 종류' },
        category: { type: 'string', enum: ['preference', 'rule', 'alias', 'pattern'], description: '기억 분류' },
        key: { type: 'string', description: '기억 키 (예: 방수_업체, 수원_실측_담당)' },
        value: { type: 'string', description: '기억 값 (예: A방수업체, 김재호)' },
        search_keyword: { type: 'string', description: '검색 시 키워드' },
      },
      required: ['action'],
    },
  },
  // --- Phase C: 구글드라이브 도구 ---
  {
    name: 'save_photo_to_drive',
    description: '첨부된 사진을 구글드라이브의 프로젝트 폴더에 저장합니다. 사진 유형: 실측/시공전/시공중/시공후',
    input_schema: {
      type: 'object' as const,
      properties: {
        building_name: { type: 'string', description: '빌라명 (검색용)' },
        photo_type: { type: 'string', enum: ['실측', '시공전', '시공중', '시공후'], description: '사진 유형' },
        file_name: { type: 'string', description: '저장할 파일명 (기본: 자동생성)' },
      },
      required: ['building_name', 'photo_type'],
    },
  },
  {
    name: 'manage_drive',
    description: '구글드라이브에 폴더 생성, 파일 목록 조회, 연결 테스트를 수행합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['test', 'create_project_folder', 'create_site_folder', 'list_files'], description: '작업 종류' },
        city_name: { type: 'string', description: '도시명 (프로젝트 폴더 생성 시)' },
        category: { type: 'string', enum: ['소규모', '수도'], description: '카테고리 (프로젝트 폴더 생성 시)' },
        building_name: { type: 'string', description: '빌라명 (프로젝트 폴더 생성 시)' },
        site_name: { type: 'string', description: '현장명 (현장 폴더 생성 시)' },
        folder_id: { type: 'string', description: '파일 목록 조회 시 폴더 ID' },
      },
      required: ['action'],
    },
  },
  {
    name: 'match_deposit',
    description: '입금 문자(예: [Web발신] 2026/04/17 입금 150,000원 김경숙)에서 금액/이름을 추출해 후보 프로젝트 목록을 반환합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deposit_text: { type: 'string', description: '입금 문자 원문' },
      },
      required: ['deposit_text'],
    },
  },
  {
    name: 'record_deposit',
    description: '프로젝트에 입금을 기록합니다. 확인자(confirmer_name)는 반드시 현재 사용자 이름. 중복 방지 로직 포함.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: '프로젝트 ID' },
        amount: { type: 'number', description: '입금 금액 (원)' },
        payer_name: { type: 'string', description: '입금자명' },
        confirmer_name: { type: 'string', description: '확인한 직원 이름' },
        payment_date: { type: 'string', description: '입금일 YYYY-MM-DD (기본: 오늘)' },
      },
      required: ['project_id', 'amount'],
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

    // 5. 구글드라이브 폴더 자동 생성
    const projectId = data?.[0]?.id
    let driveFolderInfo = null
    if (projectId && matchedCity && category && building_name) {
      try {
        const folderId = await ensureProjectFolder(
          matchedCity + '시',
          category as '소규모' | '수도',
          String(building_name)
        )
        const driveUrl = `https://drive.google.com/drive/folders/${folderId}`
        await supabaseAdmin.from('projects').update({ drive_folder_id: folderId, drive_folder_url: driveUrl }).eq('id', projectId)
        driveFolderInfo = { folderId, driveUrl }
      } catch { /* 드라이브 실패해도 접수는 성공 */ }
    }

    return JSON.stringify({ success: true, project: data?.[0], city: matchedCity, drive: driveFolderInfo })
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
    // 카테고리 필터: 확정된 work_type_id로 직접 필터 (ORM join 불안정 → 하드코딩)
    const WATER_TYPE_IDS = ['01ca1009-8946-4346-9d20-1b34e30bf8a3', 'cfae03cc-0a9f-4809-a43a-ed05fd46207a']
    let categoryTypeIds: string[] | null = null
    if (category === '수도') {
      categoryTypeIds = WATER_TYPE_IDS
    } else if (category === '소규모') {
      // 소규모 = 수도가 아닌 모든 work_type
      const { data: allWt } = await supabaseAdmin.from('work_types').select('id')
      categoryTypeIds = (allWt || []).map((wt: Record<string, unknown>) => wt.id as string).filter(id => !WATER_TYPE_IDS.includes(id))
    }

    let query = supabaseAdmin
      .from('projects')
      .select('id, building_name, owner_name, owner_phone, road_address, jibun_address, status, city_id, staff_id, note, cities(name), staff:staff_id(name), work_types(name, work_categories(name))')

    // 카테고리 필터 (DB 레벨)
    if (categoryTypeIds && categoryTypeIds.length > 0) {
      query = query.in('work_type_id', categoryTypeIds)
    }

    // 상태 그룹 필터
    if (status_group && STATUS_GROUP_MAP[status_group as string]) {
      query = query.in('status', STATUS_GROUP_MAP[status_group as string])
    }

    // 도시 필터
    if (city) {
      const { data: cityData } = await supabaseAdmin.from('cities').select('id').ilike('name', `%${city}%`).maybeSingle()
      if (cityData) query = query.eq('city_id', cityData.id)
    }

    // 키워드 검색
    if (keyword) {
      const sanitized = (keyword as string).replace(/[%_\\]/g, '\\$&')
      query = query.or(`building_name.ilike.%${sanitized}%,owner_name.ilike.%${sanitized}%,road_address.ilike.%${sanitized}%,jibun_address.ilike.%${sanitized}%`)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) return JSON.stringify({ error: error.message })

    const results = data || []

    // 건수만 반환
    if (count_only) {
      // 상태별 + 도시별 분포
      const statusCounts: Record<string, number> = {}
      const cityCounts: Record<string, number> = {}
      results.forEach((p: Record<string, unknown>) => {
        const s = (p.status as string) || '미지정'
        statusCounts[s] = (statusCounts[s] || 0) + 1
        const c = ((p.cities as Record<string, unknown>)?.name as string) || '미지정'
        cityCounts[c] = (cityCounts[c] || 0) + 1
      })
      return JSON.stringify({
        total: results.length,
        status_breakdown: statusCounts,
        city_breakdown: cityCounts,
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
      memo: (input.memo as string) || null,
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
    if (input.search_type) q = q.eq('schedule_type', input.search_type as string)
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

// --- Phase B: 분석 + 학습 함수들 ---

async function getDashboardStats(input: Record<string, unknown>): Promise<string> {
  const month = (input.month as string) || new Date().toISOString().slice(0, 7)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`
  try {
    const [projRes, expRes, siteRes, schedRes, payRes] = await Promise.all([
      supabaseAdmin.from('projects').select('status, total_cost, collected, outstanding, city_id, cities(name)').gte('created_at', monthStart).lte('created_at', `${monthEnd}T23:59:59`),
      supabaseAdmin.from('expenses').select('amount, category, status').gte('expense_date', monthStart).lte('expense_date', monthEnd),
      supabaseAdmin.from('sites').select('id, status'),
      supabaseAdmin.from('schedules').select('id, confirmed, schedule_type').gte('start_date', monthStart).lte('start_date', monthEnd).neq('schedule_type', 'site'),
      supabaseAdmin.from('payments').select('amount').gte('payment_date', monthStart).lte('payment_date', monthEnd),
    ])
    const projects = projRes.data || []
    const expenses = expRes.data || []
    const sites = siteRes.data || []
    const schedules = schedRes.data || []
    const payments = payRes.data || []

    // 접수 현황
    const statusCount: Record<string, number> = {}
    projects.forEach((p: Record<string, unknown>) => { statusCount[p.status as string] = (statusCount[p.status as string] || 0) + 1 })

    // 도시별
    const cityCount: Record<string, number> = {}
    projects.forEach((p: Record<string, unknown>) => { const c = (p.cities as Record<string, unknown>)?.name as string || '미지정'; cityCount[c] = (cityCount[c] || 0) + 1 })

    // 지출
    const expTotal = expenses.reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0)
    const expByCat: Record<string, number> = {}
    expenses.forEach((e: Record<string, unknown>) => { expByCat[e.category as string] = (expByCat[e.category as string] || 0) + (Number(e.amount) || 0) })

    // 미수금
    const totalOutstanding = projects.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.outstanding) || 0), 0)
    const totalCollected = payments.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.amount) || 0), 0)

    return JSON.stringify({
      month,
      projects: { total: projects.length, by_status: statusCount, by_city: cityCount },
      finance: { total_expense: expTotal, expense_by_category: expByCat, total_collected: totalCollected, total_outstanding: totalOutstanding },
      sites: { total: sites.length, active: sites.filter((s: Record<string, unknown>) => s.status !== 'completed').length },
      schedules: { total: schedules.length, completed: schedules.filter((s: Record<string, unknown>) => s.confirmed).length },
    })
  } catch (err) {
    return JSON.stringify({ error: `통계 조회 실패: ${err}` })
  }
}

async function generateReport(input: Record<string, unknown>): Promise<string> {
  const reportType = input.type as string
  const baseDate = (input.date as string) || new Date().toISOString().slice(0, 10)

  let dateFrom: string, dateTo: string
  if (reportType === 'daily') {
    dateFrom = dateTo = baseDate
  } else if (reportType === 'weekly') {
    const d = new Date(baseDate); const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    dateFrom = mon.toISOString().slice(0, 10); dateTo = sun.toISOString().slice(0, 10)
  } else {
    dateFrom = baseDate.slice(0, 7) + '-01'; dateTo = baseDate.slice(0, 7) + '-31'
  }

  try {
    const [projRes, logRes, schedRes, expRes] = await Promise.all([
      supabaseAdmin.from('status_logs').select('from_status, to_status, note, created_at, projects(building_name)').gte('created_at', dateFrom).lte('created_at', `${dateTo}T23:59:59`).order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('activity_log').select('action, target_type, detail, staff:staff_id(name), created_at').gte('created_at', dateFrom).lte('created_at', `${dateTo}T23:59:59`).order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('schedules').select('title, start_date, confirmed, staff:staff_id(name)').gte('start_date', dateFrom).lte('start_date', dateTo).neq('schedule_type', 'site').order('start_date'),
      supabaseAdmin.from('expenses').select('title, amount, category, expense_date').gte('expense_date', dateFrom).lte('expense_date', dateTo),
    ])

    return JSON.stringify({
      report_type: reportType,
      period: { from: dateFrom, to: dateTo },
      status_changes: (projRes.data || []).map((l: Record<string, unknown>) => ({
        building: (l.projects as Record<string, unknown>)?.building_name,
        from: l.from_status, to: l.to_status, note: l.note,
      })),
      activities: (logRes.data || []).slice(0, 20).map((a: Record<string, unknown>) => ({
        staff: (a.staff as Record<string, unknown>)?.name,
        action: a.action, detail: a.detail,
      })),
      schedules: { total: schedRes.data?.length || 0, completed: schedRes.data?.filter((s: Record<string, unknown>) => s.confirmed).length || 0, items: schedRes.data?.slice(0, 10) },
      expenses: { total_amount: (expRes.data || []).reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0), count: expRes.data?.length || 0 },
      instruction: 'AI는 이 데이터를 기반으로 서술형 보고서를 작성하세요. 핵심 성과, 주요 변동, 주의사항을 포함.',
    })
  } catch (err) {
    return JSON.stringify({ error: `보고서 생성 실패: ${err}` })
  }
}

async function getActivityLog(input: Record<string, unknown>): Promise<string> {
  const { staff_name, date, action } = input as Record<string, string | undefined>
  const targetDate = date || new Date().toISOString().slice(0, 10)
  let q = supabaseAdmin.from('activity_log')
    .select('action, target_type, detail, staff:staff_id(name), created_at')
    .gte('created_at', targetDate)
    .lte('created_at', `${targetDate}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(30)

  if (staff_name) {
    const { data: s } = await supabaseAdmin.from('staff').select('id').ilike('name', `%${staff_name}%`).limit(1).single()
    if (s) q = q.eq('staff_id', s.id)
  }
  if (action) q = q.eq('action', action)

  const { data, error } = await q
  if (error) return JSON.stringify({ error: error.message })
  return JSON.stringify({
    date: targetDate, total: data?.length || 0,
    activities: (data || []).map((a: Record<string, unknown>) => ({
      staff: (a.staff as Record<string, unknown>)?.name,
      action: a.action, target: a.target_type, detail: a.detail,
      time: (a.created_at as string)?.slice(11, 16),
    })),
  })
}

async function manageMemory(input: Record<string, unknown>): Promise<string> {
  const { action } = input as Record<string, string | undefined>
  if (action === 'save') {
    const { category, key, value } = input as Record<string, string | undefined>
    if (!key || !value) return JSON.stringify({ error: 'key, value 필수' })
    // upsert: 같은 key가 있으면 업데이트
    const { data: existing } = await supabaseAdmin.from('ai_memory').select('id').eq('key', key).limit(1).single()
    if (existing) {
      await supabaseAdmin.from('ai_memory').update({ value, category: category || 'preference' }).eq('id', existing.id)
      return JSON.stringify({ success: true, action: 'updated', key, value })
    }
    const { error } = await supabaseAdmin.from('ai_memory').insert({ category: category || 'preference', key, value, source: 'conversation' })
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ success: true, action: 'saved', key, value })
  }
  if (action === 'search') {
    const { search_keyword, category } = input as Record<string, string | undefined>
    let q = supabaseAdmin.from('ai_memory').select('category, key, value, created_at')
    if (search_keyword) q = q.or(`key.ilike.%${search_keyword}%,value.ilike.%${search_keyword}%`)
    if (category) q = q.eq('category', category)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ total: data?.length || 0, memories: data })
  }
  if (action === 'list') {
    const { data, error } = await supabaseAdmin.from('ai_memory').select('category, key, value').order('category').order('key')
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ total: data?.length || 0, memories: data })
  }
  return JSON.stringify({ error: '지원하지 않는 action' })
}

// --- Phase C: 사진 드라이브 저장 ---
// 현재 대화의 이미지를 임시 저장 (요청 단위)
let _pendingImages: string[] = []

function setPendingImages(images: string[]) { _pendingImages = images }

async function savePhotoToDrive(input: Record<string, unknown>): Promise<string> {
  const { building_name, photo_type, file_name } = input as Record<string, string | undefined>
  if (!building_name || !photo_type) return JSON.stringify({ error: 'building_name, photo_type 필수' })

  // 1. 프로젝트 찾기
  const { data: projects } = await supabaseAdmin.from('projects')
    .select('id, building_name, drive_folder_id, city_id, cities(name), work_types(work_categories(name))')
    .ilike('building_name', `%${building_name}%`)
    .limit(1)

  if (!projects || projects.length === 0) return JSON.stringify({ error: `"${building_name}" 프로젝트를 찾을 수 없습니다` })
  const project = projects[0] as Record<string, unknown>

  // 2. 드라이브 폴더 확보
  let projectFolderId = project.drive_folder_id as string | null
  if (!projectFolderId) {
    const cityName = ((project.cities as Record<string, unknown>)?.name as string) || '미지정'
    const wc = (project.work_types as Record<string, unknown>)?.work_categories as Record<string, unknown> | null
    const category = (wc?.name as string) === '수도' ? '수도' : '소규모'
    try {
      projectFolderId = await ensureProjectFolder(cityName, category as '소규모' | '수도', project.building_name as string)
      const driveUrl = `https://drive.google.com/drive/folders/${projectFolderId}`
      await supabaseAdmin.from('projects').update({ drive_folder_id: projectFolderId, drive_folder_url: driveUrl }).eq('id', project.id)
    } catch (e) { return JSON.stringify({ error: `드라이브 폴더 생성 실패: ${e}` }) }
  }

  // 3. 사진 폴더 (사진/시공전, 사진/실측 등)
  const { ensureFolderPath } = await import('@/lib/google-drive')
  const photoFolderId = await ensureFolderPath(['사진', photo_type])
    .catch(() => null)

  // projectFolderId 하위에 사진/photo_type 폴더
  const { findOrCreateFolder } = await import('@/lib/google-drive')
  const photoDir = await findOrCreateFolder('사진', projectFolderId)
  const typeDir = await findOrCreateFolder(photo_type, photoDir.id)

  // 4. 이미지 저장
  if (_pendingImages.length === 0) return JSON.stringify({ error: '첨부된 사진이 없습니다. 사진을 먼저 첨부해주세요.' })

  const saved = []
  for (let i = 0; i < _pendingImages.length; i++) {
    const imgData = _pendingImages[i]
    const buffer = Buffer.from(imgData, 'base64')
    const timestamp = new Date().toISOString().slice(0, 10)
    const name = file_name || `${project.building_name}_${photo_type}_${timestamp}_${i + 1}.jpg`
    try {
      const result = await uploadFile(name, buffer, 'image/jpeg', typeDir.id)
      saved.push({ name, driveUrl: result.webViewLink })
    } catch (e) {
      saved.push({ name, error: String(e) })
    }
  }
  _pendingImages = [] // 저장 후 초기화

  return JSON.stringify({
    success: true,
    building: project.building_name,
    photo_type,
    folder: `사진/${photo_type}`,
    saved_count: saved.filter(s => !('error' in s)).length,
    files: saved,
  })
}

// --- Phase C: 구글드라이브 함수 ---
async function manageDrive(input: Record<string, unknown>): Promise<string> {
  const { action } = input as Record<string, string | undefined>
  try {
    if (action === 'test') {
      const result = await testConnection()
      return JSON.stringify(result)
    }
    if (action === 'create_project_folder') {
      const { city_name, category, building_name } = input as Record<string, string | undefined>
      if (!city_name || !category || !building_name) return JSON.stringify({ error: 'city_name, category, building_name 필수' })
      const folderId = await ensureProjectFolder(city_name, category as '소규모' | '수도', building_name)
      return JSON.stringify({ success: true, folderId, path: `지원사업/${city_name}/${category}/${building_name}` })
    }
    if (action === 'create_site_folder') {
      const { site_name } = input as Record<string, string | undefined>
      if (!site_name) return JSON.stringify({ error: 'site_name 필수' })
      const folderId = await ensureSiteFolder(site_name)
      return JSON.stringify({ success: true, folderId, path: `현장/${site_name}` })
    }
    if (action === 'list_files') {
      const files = await listFiles((input.folder_id as string) || undefined)
      return JSON.stringify({ total: files.length, files })
    }
    return JSON.stringify({ error: '지원하지 않는 action' })
  } catch (err) {
    return JSON.stringify({ error: `드라이브 오류: ${err}` })
  }
}

// --- 입금 매칭 ---
async function matchDeposit(input: Record<string, unknown>): Promise<string> {
  const text = (input.deposit_text as string) || ''
  // 금액 파싱
  const amountMatch = text.match(/입금\s*([\d,]+)\s*원?/) || text.match(/([\d]{1,3}(?:,\d{3})+)\s*원/)
  const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 0

  // 이름 파싱: 전체 텍스트에서 한글 2-4자 모두 추출 → 제외 키워드 빼고 첫 번째
  const EXCLUDE_WORDS = new Set([
    '입금', '출금', '이체', '발신', '본점', '기업', '국민', '농협', '신한', '우리', '하나', '카카오', '토스', '새마을',
    '수금', '지점', '계좌', '은행', '카드', '잔액', '잔고', '적요', '거래', '비고', '금액', '수수료', '발송', '송금', '수취',
    '다우', '건설', '오전', '오후',
  ])
  const allMatches = Array.from(text.matchAll(/[가-힣]{2,4}/g)).map(m => m[0])
  const payerName = allMatches.find(name => !EXCLUDE_WORDS.has(name)) || null

  if (amount === 0) return JSON.stringify({ error: '금액을 찾을 수 없습니다' })

  // 프로젝트 검색 (부분 매칭 — "김경숙 (302호)" 같은 경우 포함)
  const candidateMap = new Map<string, Record<string, unknown>>()
  if (payerName) {
    const selectCols = 'id, building_name, owner_name, payer_name, total_cost, collected, outstanding, self_pay, city_support, additional_cost, status, cities(name), water_work_type, note'
    // 1) owner_name에 이름 포함
    const { data: byOwner } = await supabaseAdmin
      .from('projects').select(selectCols)
      .ilike('owner_name', `%${payerName}%`).limit(20)
    byOwner?.forEach(p => candidateMap.set(p.id as string, p))
    // 2) payer_name에 이름 포함
    const { data: byPayer } = await supabaseAdmin
      .from('projects').select(selectCols)
      .ilike('payer_name', `%${payerName}%`).limit(20)
    byPayer?.forEach(p => candidateMap.set(p.id as string, p))
    // 3) note에 이름 포함
    const { data: byNote } = await supabaseAdmin
      .from('projects').select(selectCols)
      .ilike('note', `%${payerName}%`).limit(20)
    byNote?.forEach(p => candidateMap.set(p.id as string, p))
  }
  const candidates = Array.from(candidateMap.values())
  // 이름 매칭 실패 시 금액 fallback 하지 않음 (엉뚱한 결과 방지)

  return JSON.stringify({
    amount, payer_name: payerName,
    candidates: candidates.map(c => ({
      id: c.id,
      building_name: c.building_name,
      city: (c.cities as { name?: string } | null)?.name,
      water_work_type: c.water_work_type,
      owner_name: c.owner_name,
      total_cost: c.total_cost,
      collected: c.collected,
      outstanding: c.outstanding,
      self_pay: c.self_pay,
      city_support: c.city_support,
      additional_cost: c.additional_cost,
      status: c.status,
    })),
  })
}

// --- 입금 기록 (공통 라이브러리 사용) ---
// 요청별 현재 사용자 컨텍스트 (POST 핸들러에서 세팅)
let _currentStaffName: string = 'AI확인'
function setCurrentStaffName(name: string) { _currentStaffName = name }

async function recordDeposit(input: Record<string, unknown>): Promise<string> {
  const { project_id, amount, payer_name, confirmer_name, payment_date } = input as Record<string, string | number | undefined>
  if (!project_id || !amount) return JSON.stringify({ error: 'project_id와 amount는 필수' })

  // confirmer_name이 없으면 현재 로그인한 직원 이름으로 자동 주입
  const confirmer = (confirmer_name as string) || _currentStaffName

  const result = await applyDepositAndAdvanceStatus({
    projectId: project_id as string,
    amount: Number(amount),
    payerName: (payer_name as string) || null,
    confirmerName: confirmer,
    paymentDate: (payment_date as string) || null,
    source: 'ai',
  })

  if (!result.ok) return JSON.stringify({ error: result.error })

  // AI에게 전달 — formatted 메시지와 raw 데이터 둘 다
  return JSON.stringify({
    success: true,
    formatted_message: formatDepositMessage(result),
    payment: result.payment,
    project: result.project,
    status_change: result.statusChange,
  })
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
    case 'get_dashboard_stats':
      return getDashboardStats(input)
    case 'generate_report':
      return generateReport(input)
    case 'get_activity_log':
      return getActivityLog(input)
    case 'manage_memory':
      return manageMemory(input)
    case 'manage_drive':
      return manageDrive(input)
    case 'save_photo_to_drive':
      return savePhotoToDrive(input)
    case 'match_deposit':
      return matchDeposit(input)
    case 'record_deposit':
      return recordDeposit(input)
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
        system: `${SYSTEM_PROMPT}\n\n## 현재 사용자\n이름: ${_currentStaffName}\n- 입금 관련 도구 호출 시 confirmer_name은 생략해도 서버가 자동으로 '${_currentStaffName}'으로 처리합니다.`,
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
      messages: Array<{ role: string; content: string; images?: string[] }>
      staffId?: string
      channel?: 'web' | 'telegram'
      nonStreaming?: boolean
      pendingPhotos?: string[] // 고품질 원본 (드라이브 저장용)
    }
    const recentMessages = (messages || []).slice(-20)

    // 현재 사용자 이름 조회 → 입금 확인자 자동 주입용
    let currentStaffName = 'AI확인'
    if (staffId) {
      try {
        const { data: staff } = await supabaseAdmin.from('staff').select('name').eq('id', staffId).single()
        if (staff?.name) currentStaffName = staff.name
      } catch { /* graceful */ }
    }
    setCurrentStaffName(currentStaffName)

    // 대화 저장
    if (staffId && channel && recentMessages.length > 0) {
      const lastMsg = recentMessages[recentMessages.length - 1]
      if (lastMsg.role === 'user') {
        try {
          await supabaseAdmin.from('chat_messages').insert({
            staff_id: staffId, role: 'user', content: lastMsg.content, channel,
          })
        } catch { /* graceful */ }
      }
    }

    // Claude API 메시지 형식으로 변환 (이미지 포함)
    const claudeMessages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> =
      recentMessages.map((msg: { role: string; content: string; images?: string[] }) => {
        if (msg.role === 'user' && msg.images && msg.images.length > 0) {
          // 이미지 + 텍스트를 multimodal content로 변환
          const contentBlocks: Array<Record<string, unknown>> = []
          msg.images.forEach(img => {
            contentBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: img },
            })
          })
          if (msg.content && msg.content !== '(사진 첨부)') {
            contentBlocks.push({ type: 'text', text: msg.content })
          } else {
            contentBlocks.push({ type: 'text', text: '첨부된 사진을 확인해주세요.' })
          }
          return { role: 'user', content: contentBlocks }
        }
        return { role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }
      })

    // 첨부 이미지를 save_photo_to_drive 도구용으로 보관
    // 고품질 원본이 있으면 우선, 없으면 메시지의 이미지 사용
    const { pendingPhotos } = body as { pendingPhotos?: string[] }
    if (pendingPhotos && pendingPhotos.length > 0) {
      setPendingImages(pendingPhotos)
    } else {
      const lastUserMsg = recentMessages[recentMessages.length - 1]
      if (lastUserMsg?.images && lastUserMsg.images.length > 0) {
        setPendingImages(lastUserMsg.images)
      }
    }

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
                system: `${SYSTEM_PROMPT}\n\n## 현재 사용자\n이름: ${currentStaffName}\n- 입금 관련 도구 호출 시 confirmer_name은 생략해도 서버가 자동으로 '${currentStaffName}'으로 처리합니다.`,
                messages: claudeMessages,
                tools: TOOLS,
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('[AI] Claude API error:', response.status, errText)
              console.error('[AI] Last messages:', JSON.stringify(claudeMessages).substring(0, 2000))
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: `⚠️ Claude API 오류 (${response.status}): ${errText.substring(0, 200)}` })}\n\n`))
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
                console.log(`[AI Tool] ${block.name} input:`, JSON.stringify(block.input).substring(0, 500))
                let toolResult: string
                try {
                  toolResult = await executeTool(block.name, block.input as Record<string, unknown>)
                  console.log(`[AI Tool] ${block.name} result:`, toolResult.substring(0, 500))
                } catch (toolErr) {
                  const em = toolErr instanceof Error ? toolErr.message : String(toolErr)
                  const es = toolErr instanceof Error ? toolErr.stack : ''
                  console.error(`[AI Tool] ${block.name} threw:`, em, es)
                  toolResult = JSON.stringify({ error: `도구 실행 실패: ${em}` })
                }
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
          console.error('[AI] Chat stream error:', err)
          console.error('[AI] Stack:', err instanceof Error ? err.stack : String(err))
          const msg = err instanceof Error ? err.message : String(err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: `\n\n⚠️ 처리 중 오류: ${msg}` })}\n\n`)
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
