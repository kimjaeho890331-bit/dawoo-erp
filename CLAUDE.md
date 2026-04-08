# CLAUDE.md - 다우건설 AI ERP 개발 매뉴얼

> 이 파일은 프로젝트의 **핵심 지도**입니다.
> 상세 스펙은 docs/ 하위 MD를 참조하세요.
> 개발 시 반드시 해당 docs/ 파일을 먼저 읽고 시작하세요.

---

## 프로젝트

- **이름**: DAWOO ERP
- **목적**: 다우건설 전용 AI 기반 ERP. 정부 지원사업(수도/소규모) 접수~수금 전 과정 자동화 + 건설 현장 프로젝트 관리.
- **사용자**: 대표 1명(관리자, 김재호) + 직원 5명
- **15개 시**: 수원,성남,안양,부천,광명,시흥,안산,군포,의왕,과천,용인,화성,오산,평택,하남

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | Next.js 16+ (App Router), React, TypeScript, Tailwind CSS |
| Backend | Supabase (PostgreSQL, Edge Functions, Storage, Auth) |
| AI | Claude API (claude-sonnet-4-20250514) |
| 서류 자동화 | Cowork (Claude) → 구글드라이브 직접 입력 |
| 서류 저장소 | 구글드라이브 (서류 원본) + Supabase (메타데이터) |
| 외부 API | 법정동코드 API, 건축물대장 API (표제부+전유부) — 공공데이터포털 |
| 배포 | Vercel |
| 소스 | GitHub (`kimjaeho890331-bit/dawoo-erp`) |
| DB | Supabase (`etwpcaedbuubjzbfrjli.supabase.co`, Seoul 리전) |

---

## 핵심 철학

1. **AI가 주인공, 사람이 서브** — AI가 데이터 입력/서류 생성/판단. 사람은 확인/수정만.
2. **에이전트에 회사를 넣는다** — 우리회사를 에이전트 안에 넣는 구조. 직원이 적으니까 에이전트가 회사를 이해하는 게 맞음.
3. **사람 화면은 사람 편의성 최우선** — AI가 아무리 잘해도 사람이 보조할 화면은 직관적이어야.
4. **단순한 구조** — projects 한 테이블에 수도/소규모 항목 전부. AI가 한 테이블만 보는 게 실수 적음.
5. **이중 단계** — 화면 4단계(접수→승인공사→완료서류→수금) / AI 내부 10단계.
6. **데이터 하나, 뷰 여러 개** — schedules DB 1개 → 캘린더 4곳에서 표시.
7. **활동 로그 자동** — 시스템 사용 = 업무 기록. 별도 보고서 작성 없음.
8. **접수대장과 현장관리는 완전 별개** — 접수대장 = 지원사업 고객관리 / 현장관리 = 입찰/수의 건설 현장 프로젝트. 연동 없음.
9. **서류는 Cowork가 구글드라이브에 직접 입력** — pypdf 폼필드 매핑 대신 Cowork 방식. 서류 1000개의 폼필드를 유지보수하는 건 비현실적.
10. **AI는 폭발적 생산량** — 고퀄리티가 아닌 폭발적 생산량이 AI의 가치. 체계 없던 회사에 AI로 체계를 심는다.


## 공통 UI 규칙 (전체 페이지 적용)

1. **수정/삭제 필수** — 데이터를 입력하는 모든 화면에 수정/삭제 기능 포함.
2. **인라인 편집** — 평소엔 텍스트로 표시, 클릭하면 그 자리에서 수정. 네모 input 박스 남발 금지.
3. **파일 미리보기** — 서류/사진 업로드 시 미리보기 제공.
4. **사진 뷰어** — 사진 클릭 시 전체화면 뷰어. 좌우 화살표로 이동. ESC로 닫기.
5. **아이콘** — Lucide React 사용. 이모지/이모티콘 사용 금지. 아이콘 색 text-tertiary 단색 통일.
6. **드래그앤드롭 통일** — 모든 서류/사진 업로드는 드래그앤드롭 + 미리보기.

## 하지 않는 것

- 승인번호 없음 / 지점 없음(수원본사만) / 현장 캘린더 별도 메뉴 없음
- 같은 주소 중복 차단 안 함(수도+소규모 동시 가능) / 면/리 주소도 저장 가능
- CRM 별도 메뉴 없음 → 접수대장에 "문의(예약)" 상태로 포함
- 단가표 별도 페이지 없음(견적서 내장) / 접수대장에 시 컬럼 없음(태그 필터)
- 입찰정보 수집 안 함(외부 업체) / 연와조 등 건축 구조 정보 저장 안 함
- 접수대장 ↔ 현장관리 연동 없음 (완전 별개)

---

## 전체 데이터 흐름

### 캘린더 데이터 흐름
```
[입력 4곳]                         [DB 1개]           [출력 4곳]
접수대장 (실측/시공/제출일)    ──→               ──→  업무 캘린더
현장관리 (착공~준공 공정)      ──→   schedules   ──→  현장관리 캘린더(개별)
직원/관리자 (개인 일정)        ──→    테이블     ──→  접수대장 상세(해당건)
AI 비서 (홍보/미팅 제안)       ──→               ──→  대시보드(오늘 일정)

[AI 4기능]
① 빈 일정 감지 → 홍보/미팅 제안
② 일정 충돌 체크 → 협력업체 겹침 알림
③ 공문 패턴 예측 → 작년 기준 2달 전 알림
④ 마감 알림 → 제출 D-day
```

### 보고서/분석 데이터 흐름
```
[12개 소스]
접수대장(건수)     현장관리(공정/일지)   캘린더(준수율)      활동로그(직원사용)
지출결의서(항목별)  카드지출(CSV분석)     고정지출(고정비)    거래처DB(업체평가)
홍보현황(방문기록)  A/S관리(하자패턴)    미수금(완료건기준)   현장보고서(소장최종)
                              ↓ 전부
                        [AI 분석 엔진]
                              ↓
[3종 보고서 + 긴급알림]
주간: 지원사업 + 현장 공정 + 직원 성과 + 미수금 + "다음주 제안"
월간: 카드/고정 지출(새는돈) + KPI + 지원사업 통계 + 통합 요약
현장마감: AI 현장대리인 인터뷰 → 최종 보고서 + 수익률 + 협력업체 평가
긴급: 규격외 특수 상황만 즉시 (일일 보고 없음)
                              ↓
                     [총괄 AI] 긴급→주의→정상 정렬
                              ↓
                   관리자 분석 페이지 (5탭) + KPI
```

---

## AI 에이전트 구조 → docs/AGENT.md

```
사용자 입력 (웹 사이드패널)
    ↓
 사용자 입력 (웹 사이드패널)
    ↓
  단일 에이전트 + tool 15~20개 (3팀 multi-agent는 오버엔지니어링)
    ├── 접수 tools: register_project, update_stage, search_projects, get_building_info
    ├── 서류 tools: trigger_cowork, list_templates, check_doc_status
    ├── 조회 tools: get_stats, get_kpi, search_schedules, get_report
    ├── 공통 tools: search_address, get_calendar, create_schedule
    └── 기억 tools: save_memory, update_preference, read_knowledge
    ### AI 3가지 역할 → docs/AI_RULES.md
문지기: 실수 방지, 단계 검증, 누락 알림
비서: 업무 도움, 코칭, 선제 제안, Cowork 서류 생성
분석가: 주간/월간 보고, KPI, 판단 근거

```

핵심 규칙:
- 애매하면 되물어보기
- 필수 미입력 → 다음 단계 차단
- 서류 부족 → 프린트 차단
- 빌라명 앞글자 일치 → 확인 후 정식명칭 저장 + 별칭 메모
- 공사종류 자동분류: 소규모(방수/옥상/기와/도장/계단/담장/기타) vs 수도(수도/공용/아파트수도/아파트공용/옥내)
- 애매하면 반드시 물어보기

---

## 페이지 구조 (15개 메뉴, 6그룹)

```
[지원사업]
  /register/small       소규모 접수대장
  /register/water       수도공사 접수대장
[현장]
  /sites                현장관리 (접수대장과 완전 별개, +현장등록 버튼으로 독립 생성)
[업무]
  /calendar/work        업무 캘린더 (2탭: 캘린더+홍보현황)
  /expenses             지출관리 (3탭: 지출결의서+카드지출+고정지출)
  /leave                연차신청
[데이터]
  /vendors              거래처 DB (2탭: 협력업체+일용직)
  /as                   A/S 관리
[관리]
  /documents            서류함 (4탭: 회사기본+수도+소규모+입찰현장)
  /staff                직원관리
  /accounting-cal       회계달력
[분석]
  /reports              보고서 (총괄AI + 개별 보고서 목록)
  /kpi                  KPI (3탭: 총괄+상세+기준설정)
[공통]
  /dashboard            직원 대시보드
  /notice               공지사항 (규율/규정 포함)
  /settings             설정
  AI 비서 = 오른쪽 사이드 패널 (모든 페이지)
```

---

## DB 핵심 테이블 (22개)

| 테이블 | 역할 |
|--------|------|
| staff | 직원 (이름, 역할, 색깔) |
| cities | 15개 시 |
| work_categories | 공사 대분류 (수도, 소규모) |
| work_types | 공사 소분류 (옥내수도, 방수 등 11개) |
| projects | 접수대장 (수도/소규모 통합, building_alias 별칭 포함) |
| payments | 복수 입금 (자부담착수금/추가공사비/시지원금잔금) |
| status_logs | 단계 변경 이력 |
| templates | 서류 템플릿 (서류함, 유효기간 포함) |
| documents | 생성된 서류 |
| attachments | 첨부파일 |
| schedules | 캘린더 (DB 1개, 입력4곳 출력4곳) |
| sites | 현장관리 (접수대장과 별개) |
| site_tasks | 현장 공정 바 (확정/미확정) |
| site_logs | 현장일지 |
| site_photos | 현장일지 사진 (4장고정 + 기타20장) |
| activity_log | 활동 로그 (자동, 관리자만 전체열람) |
| expenses | 지출결의서 |
| estimates | 견적서 (웹 스프레드시트 데이터) |
| kpi_settings | KPI 기준 (대표 수정 가능) |
| vendors | 거래처 DB (협력업체+일용직) |
| promo_records | 홍보 기록 (소규모15/수도7/학교7, 동 단위) |
| as_records | A/S 관리 |
| ai_knowledge | AI 기준선/통계/패턴 (자동 갱신) |
| ai_memory | AI 기억 (대화로 수정 가능한 선호/규칙) |
| chat_history | 대화 기록 |
| cowork_tasks | Cowork 서류 자동입력 작업 큐 |


상세 → dawoo_db_schema.sql, sql/ai_tables.sql

---

## KPI 배점 구조 (100점 만점)

| 영역 | 배점 | 방식 |
|------|------|------|
| 지원사업 성과 (직원별) | 30점 | 정량 AI 자동 |
| 현장 성과 (현장별/소장별) | 25점 | 정량 AI 자동 |
| 업무 효율 (직원별) | 25점 | 정량 AI + 정성 대표 |
| 협력업체/일용직 | 10점 | 정량 AI 자동 |
| 업무 상황점수 (대표설정) | 10점 | 정성 대표 직접 |

등급: S(90+) A(80+) B(70+) C(60+) D(60-)
상세 → docs/REPORT_KPI.md

---

## 기능별 요약

| 기능 | 핵심 | 상세 |
|------|------|------|
| 접수대장 | 소규모/수도 탭, 진행중 기본뷰, 담당직원 맨앞, 시 태그필터, 상시표시+6탭, 복수입금 | docs/REGISTER.md |
| 현장관리 | **접수대장과 별개**, +현장등록 버튼, 아코디언, 공정캘린더(드래그앤드롭), 일지사진2칸, 서류카드 | docs/SITE.md |
| 견적서 | 웹 스프레드시트, 새 페이지(/estimate/[id]), 폼1개(15시공통), 단가내장 | docs/ESTIMATE.md |
| 서류함 | 구글드라이브 템플릿 연결, 4탭(회사/수도/소규모/입찰), Cowork 서류입력 트리거 |
| 업무캘린더 | 직원별색깔, 2탭(캘린더+홍보현황), AI교정(시간/동선/빈일정/마감) | docs/CALENDAR.md |
| 지출관리 | 3탭 통합 (지출결의서+카드지출+고정지출) | docs/PAGES_SPEC.md |
| 보고서 | 12소스→4종보고서→총괄AI→관리자분석5탭 | docs/REPORT_KPI.md |
| KPI | 4대영역 100점, 정량75+정성25, S~D등급 | docs/REPORT_KPI.md |
| AI에이전트 | 단일에이전트+tool15~20개, 되묻기, 기억(ai_memory) |
| AI행동규칙 | 문지기+비서+분석가, 기준선자동, 대화수정 가능 | docs/AI_RULES.md |
| 대시보드 | 직원용(오늘일정+받은업무+지시업무+AI제안+메모장) | docs/PAGES_SPEC.md |

---

## 개발 로드맵 (Phase)

Phase 1: ERP 기본 안정화
  - 접수대장/현장관리/캘린더/서류함 버그 없이 동작
  - 미니멀 Auth (로그인 + 직원/관리자 구분)
  - 대시보드 "오늘 할 일" 표시
  - 노션 데이터 → Supabase 마이그레이션
  - 현장일지 매일 필수 + 사진 모바일 업로드

Phase 2: 서류 자동화 (Cowork)
  - 구글드라이브 세팅 (레이드드라이브에서 이전)
  - 서류함 → 구글드라이브 템플릿 연결
  - Cowork 연동: ERP 데이터 → Cowork → 구글드라이브 서류 입력
  - 작업 큐 (cowork_tasks) + 완료 알림

Phase 3: AI 업무 기능
  - 활동 로그 자동 기록
  - KPI 엔진 (정량 자동 + 정성 대표)
  - 보고서 생성 (주간/월간/현장마감)
  - AI 스케줄링 (빈일정 → 홍보/업무 제안)
  - 세무/노무 자료 자동 정리 (송승란 과장 업무 보조)
  - 업무캘린더 날씨 표시 + 우천 현장 알림

Phase 4: 고도화
  - AI 현장대리인 인터뷰 → 대표용 보고서
  - AI 연봉협상 (KPI 데이터 기반)
  - 세무 AI (지출 분석, 불필요 지출 탐지)
  - 노무 AI (근태/연차 기반)
  - 계절 패턴 학습 (1년 이상 데이터 후)
  - 재방문 고객 자동 추적
  - 협력업체 자동 등급

## docs/ 참조표

| 파일 | 용도 |
|------|------|
| docs/REGISTER.md | 접수대장 상세 스펙 |
| docs/SITE.md | 현장관리 상세 스펙 (접수대장과 별개 명시) |
| docs/ESTIMATE.md | 견적서 상세 스펙 |
| docs/DOCUMENTS.md | 서류함 상세 스펙 |
| docs/CALENDAR.md | 캘린더 상세 스펙 |
| docs/REPORT_KPI.md | 보고서 + KPI 배점표 (264줄) |
| docs/PAGES_SPEC.md | 전체 페이지별 화면 스펙 (449줄) |
| docs/DESIGN.md | 디자인 시스템 (Linear 기반, 286줄) |
| docs/AGENT.md | AI 에이전트 총괄 (라우터+공통규칙) |
| docs/AGENT_REGISTER.md | 접수팀 에이전트 (접수흐름+단계전환) |
| docs/AGENT_DOCS.md | 서류팀 에이전트 (PDF생성+OCR+견적서) |
| docs/AGENT_QUERY.md | 조회팀 에이전트 (보고서+KPI+알림) |
| docs/DAWOO_DESIGN_FINAL.md | 전체 설계 통합 (참고용) |
| dawoo_db_schema.sql | DB 22개 테이블 스키마 |

---

## 구현 현황 (2026-04 기준)

| 기능 | 상태 | 구현된 것 | 미구현 |
|------|------|-----------|--------|
| 접수대장 목록 | ✅ 완료 | 상태필터, 시태그, 검색, CRUD, 신규등록모달 | - |
| 접수대장 상세 | ✅ 완료 | 6탭 구조, 프로그레스바, 기본/1~4단계탭 | 서류/첨부탭 일부 미완, 단계전환 검증 없음 |
| AI 비서 | 🔶 부분 | 접수등록/조회, 주소/건축물대장 연동 (5개 도구) | 수정/삭제, 단계변경, 서류팀/조회팀 |
| 현장관리 | ✅ 완료 | 아코디언, 공정캘린더, 일지/사진/서류 | - |
| 견적서 | ✅ 완료 | 스프레드시트, 자동산출, 단가, 별도 페이지 | - |
| 서류함 | ✅ 완료 | 4탭, 파일업로드, 유효기간 | PDF 폼필드 자동생성 미연동 |
| 캘린더 | ✅ 완료 | 월간뷰, 일정CRUD, 홍보현황 | AI 교정(시간/동선/빈일정) |
| 지출관리 | ✅ 완료 | 3탭, 카드CSV파싱, 이상탐지 | - |
| 대시보드 | ✅ 완료 | 오늘일정, 업무, 메모, AI제안 | - |
| 보고서 | ✅ 완료 | UI 구현 (5탭) | AI 분석 엔진 미연동 |
| KPI | ✅ 완료 | 3탭 UI (총괄/상세/기준설정) | AI 자동산출 미연동 |
| 거래처DB | ✅ 완료 | 협력업체+일용직 2탭 | - |
| A/S관리 | ✅ 완료 | 등록/조회 | - |
| 직원관리 | ✅ 완료 | CRUD | - |
| 연차신청 | ✅ 완료 | 신청/승인 | - |
| 공지사항 | ✅ 완료 | CRUD | - |
| 회계달력 | ✅ 완료 | 캘린더뷰 | - |
| 설정 | ✅ 완료 | 기본설정 | - |
| OCR | ✅ 완료 | 통장사본 OCR (Claude Vision) | - |

---

## 개발 규칙 (코드 패턴)

### 컴포넌트 구조
```
src/components/[기능명]/[기능명]Page.tsx   ← 메인 컴포넌트
src/app/[기능명]/page.tsx                  ← 라우트 (Page 컴포넌트 import만)
```

### 타입
- `src/types/index.ts` — 중앙 타입 정의 (Project, Staff, City, WorkType 등)
- 10단계 상태: 문의→실사→견적전달→동의서→신청서제출→승인→착공계→공사→완료서류제출→입금
- 4단계 UI매핑: STATUS_STAGE_MAP으로 10단계→4스테이지 변환

### Supabase 클라이언트
- 프론트엔드: `src/lib/supabase.ts` (anon key, 브라우저)
- API Route: `createClient(url, service_role_key)` (서버, RLS 우회)

### 데이터 액세스
- `src/lib/api/projects.ts` — 프로젝트 조회 (카테고리/상태/시 필터)
- `src/lib/api/staff.ts` — 직원 목록
- `src/lib/api/cities.ts` — 시 목록

### API 라우트
| 경로 | 역할 |
|------|------|
| `/api/chat` | AI 비서 (Claude + Tool Use) |
| `/api/address/search` | 도로명주소 검색 (Juso API) |
| `/api/address/building` | 건축물대장 표제부 |
| `/api/address/units` | 건축물대장 전유부 |
| `/api/ocr/bank` | 통장사본 OCR (Claude Vision) |
| `/api/pricing` | 견적 단가 산출 |
| `/api/storage/upload` | Supabase Storage 업로드 |
| `/api/storage/delete` | Supabase Storage 삭제 |

### CSS / 디자인 토큰
- Tailwind v4 + CSS 변수 (`globals.css`의 `@theme inline`)
- 커스텀 클래스: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input-field`, `.card`, `.badge`
- 폰트: Pretendard(한국어), Inter(숫자/영문), Berkeley Mono(코드)
- 상세 → docs/DESIGN.md

---

## 환경변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase 공개 키
SUPABASE_SERVICE_ROLE_KEY     # Supabase 서비스 키 (API Route 전용)
ANTHROPIC_API_KEY             # Claude API 키
ADDRESS_API_KEY               # 도로명주소 API 키 (Juso API, 공공데이터포털)
BUILDING_API_KEY              # 건축물대장 API 키 (공공데이터포털)
```

---

## AI 에이전트 현재 구현 상태

### 구현 완료 도구 (5개)
- `search_address` — 도로명/지번 주소 검색
- `get_building_info` — 건축물대장 표제부 조회
- `get_unit_info` — 건축물대장 전유부(호별 면적) 조회
- `register_project` — 접수대장 신규 등록
- `search_projects` — 접수대장 검색/조회

### 미구현 도구 (계획)
- `update_project` — 접수 정보 수정
- `update_status` — 단계 변경
- `manage_schedule` — 캘린더 일정 관리
- `get_dashboard_stats` — 대시보드 통계
- 서류팀/조회팀 도구 전체

---

## 파일 구조

```
dawoo-erp/
├── CLAUDE.md                          # 이 파일
├── dawoo_db_schema.sql                # DB 스키마
├── docs/                              # 상세 스펙 문서
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # 루트 레이아웃
│   │   ├── page.tsx                   # / → /dashboard 리다이렉트
│   │   ├── globals.css                # 디자인 토큰 + 커스텀 클래스
│   │   ├── api/                       # API 라우트 (8개)
│   │   │   ├── chat/route.ts          # AI 비서 (Claude Tool Use)
│   │   │   ├── address/               # 주소/건물 API
│   │   │   ├── ocr/                   # OCR
│   │   │   ├── pricing/               # 견적 단가
│   │   │   └── storage/               # 파일 업로드/삭제
│   │   ├── register/                  # 접수대장 (small, water)
│   │   ├── sites/                     # 현장관리
│   │   ├── calendar/work/             # 업무 캘린더
│   │   ├── dashboard/                 # 대시보드
│   │   └── ...                        # 기타 페이지 라우트
│   ├── components/
│   │   ├── Sidebar.tsx                # 메인 네비게이션
│   │   ├── ClientLayout.tsx           # 클라이언트 레이아웃
│   │   ├── AISidebar.tsx              # AI 비서 사이드패널
│   │   ├── common/ImageViewer.tsx     # 이미지 뷰어
│   │   ├── register/                  # 접수대장 컴포넌트
│   │   ├── estimate/                  # 견적서 컴포넌트
│   │   ├── sites/                     # 현장관리 컴포넌트
│   │   └── [기능명]/[기능명]Page.tsx   # 각 기능별 메인 컴포넌트
│   ├── types/index.ts                 # 중앙 타입 정의
│   └── lib/
│       ├── supabase.ts                # Supabase 클라이언트
│       └── api/                       # 데이터 액세스 함수
└── .env.local                         # 환경변수 (git 제외)
```