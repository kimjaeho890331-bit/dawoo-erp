# CLAUDE.md - 다우건설 AI ERP
> 상세 스펙은 docs/ 하위 MD 참조. 개발 시 반드시 해당 docs/ 파일 먼저 읽고 시작.

## 프로젝트
- **DAWOO ERP**: 정부 지원사업(수도/소규모) 접수~수금 자동화 + 건설 현장 프로젝트 관리
- **사용자**: 대표 1명(김재호) + 직원 5명
- **15개 시**: 수원,성남,안양,부천,광명,시흥,안산,군포,의왕,과천,용인,화성,오산,평택,하남

## 기술 스택
| 구분 | 기술 |
|------|------|
| Frontend | Next.js 16+ (App Router), React, TypeScript, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Edge Functions, Storage, Auth) |
| AI | Claude API (claude-sonnet-4-20250514) |
| 서류 자동화 | Cowork (Claude) → 구글드라이브 직접 입력 |
| 외부 API | 도로명주소(Juso), 건축물대장(표제부+전유부+소유자), NEIS 학교 |
| 배포 | Vercel / GitHub (`kimjaeho890331-bit/dawoo-erp`) |
| DB | Supabase (`etwpcaedbuubjzbfrjli.supabase.co`, Seoul) |

## 핵심 철학
1. **AI가 주인공** — AI가 입력/서류/판단. 사람은 확인/수정만
2. **에이전트에 회사를 넣는다** — 직원 적으니 에이전트가 회사를 이해하는 구조
3. **사람 화면은 편의성 최우선** — 직관적이어야
4. **단순한 구조** — projects 한 테이블에 수도/소규모 전부
5. **이중 단계** — 화면 4단계 / AI 내부 10단계
6. **데이터 하나, 뷰 여러 개** — schedules 1개 → 캘린더 4곳 표시
7. **활동 로그 자동** — 시스템 사용 = 업무 기록
8. **접수대장 ↔ 현장관리 별개** — 연동 없음
9. **서류는 Cowork → 구글드라이브** — 폼필드 유지보수 비현실적
10. **AI는 폭발적 생산량** — 체계 없던 회사에 AI로 체계를 심는다

## 공통 UI 규칙
- 수정/삭제 필수 / 인라인 편집 (input 남발 금지)
- 파일: 드래그앤드롭 + 미리보기 / 사진: 전체화면 뷰어
- 아이콘: Lucide React, text-tertiary 단색. 이모지 금지

## 하지 않는 것
- 승인번호 없음 / 지점 없음(수원본사만) / CRM 별도 없음(접수대장에 포함)
- 같은 주소 중복 차단 안 함 / 접수대장↔현장관리 연동 없음
- 단가표 별도 없음(견적서 내장) / 입찰정보 수집 안 함(외부 업체)

## 페이지 구조 (15개 메뉴)
```
[지원사업] /register/small 소규모 | /register/water 수도
[현장]    /sites 현장관리 (접수대장과 별개)
[업무]    /calendar/work 캘린더(2탭) | /expenses 지출(3탭) | /leave 연차
[데이터]  /vendors 거래처DB(2탭) | /as A/S관리
[관리]    /documents 서류함(4탭) | /staff 직원 | /accounting-cal 회계달력
[분석]    /reports 보고서 | /kpi KPI(3탭)
[공통]    /dashboard 대시보드 | /notice 공지 | /settings 설정
          AI 비서 = 오른쪽 사이드 패널 (모든 페이지)
```

## DB 테이블 (22개)
| 테이블 | 역할 |
|--------|------|
| staff | 직원 (이름, 역할, 색깔) |
| cities | 15개 시 |
| work_categories / work_types | 공사 대분류(수도/소규모) + 소분류(11개) |
| projects | 접수대장 (수도/소규모 통합) |
| payments | 복수 입금 |
| status_logs | 단계 변경 이력 |
| templates / documents / attachments | 서류 템플릿 + 생성 서류 + 첨부파일 |
| schedules | 캘린더 (DB 1개, 입력4곳 출력4곳) |
| sites / site_tasks / site_logs / site_photos | 현장관리 |
| activity_log | 활동 로그 (자동) |
| expenses / estimates | 지출결의서 + 견적서 |
| kpi_settings / vendors / promo_records / as_records | KPI + 거래처 + 홍보 + A/S |
| ai_knowledge / ai_memory / chat_history / cowork_tasks | AI 관련 |
상세 → dawoo_db_schema.sql

## 기능별 요약
| 기능 | 핵심 | 상세 |
|------|------|------|
| 접수대장 | 소규모/수도탭, 시태그, 6탭상세, 복수입금, 자동저장 | docs/REGISTER.md |
| 현장관리 | 접수대장과 별개, 아코디언, 공정캘린더, 일지사진 | docs/SITE.md |
| 견적서 | 웹 스프레드시트, 단가내장 | docs/ESTIMATE.md |
| 캘린더 | 직원별색깔, 홍보현황탭 | docs/CALENDAR.md |
| 서류함 | 4탭, 구글드라이브 연결 | docs/DOCUMENTS.md |
| 보고서+KPI | 12소스→4종보고서, 100점 배점 | docs/REPORT_KPI.md |

## 개발 로드맵
- **Phase 1**: ERP 기본 안정화 (접수/현장/캘린더/서류 버그 없이 동작, Auth, 대시보드)
- **Phase 2**: 서류 자동화 (구글드라이브 + Cowork 연동)
- **Phase 3**: AI 업무 (활동로그, KPI, 보고서, 스케줄링, 날씨)
- **Phase 4**: 고도화 (현장대리인, 연봉협상, 세무/노무 AI, 계절패턴)

## 구현 현황 (2026-04)
| 기능 | 상태 |
|------|------|
| 접수대장 목록+상세 | ✅ (6탭, 프로그레스바, 자동저장, 캘린더연동) |
| 현장관리/견적서/서류함/캘린더 | ✅ |
| 지출관리/대시보드/거래처/A·S/직원/연차/공지/회계달력/설정 | ✅ |
| AI 비서 | 🔶 (5개 도구: 주소검색, 표제부, 전유부, 접수등록, 조회) |
| 보고서/KPI | ✅ UI만 (AI 엔진 미연동) |

## 코드 패턴
```
src/components/[기능명]/[기능명]Page.tsx   ← 메인 컴포넌트
src/app/[기능명]/page.tsx                  ← 라우트 (import만)
```
- 타입: `src/types/index.ts` — 10단계 상태, STATUS_STAGE_MAP
- Supabase: `src/lib/supabase.ts`(프론트) / API Route는 `service_role_key`
- CSS: Tailwind v4 + CSS 변수, Pretendard(한글) + Inter(영문)

## API 라우트
| 경로 | 역할 |
|------|------|
| `/api/chat` | AI 비서 (Claude Tool Use) |
| `/api/address/search` | 도로명주소 (Juso API) |
| `/api/address/building` | 건축물대장 표제부 |
| `/api/address/units` | 건축물대장 전유부 |
| `/api/address/owner` | 건축물대장 소유자 (활성화 대기) |
| `/api/schools` | NEIS 학교 API |
| `/api/ocr/bank` | 통장사본 OCR |
| `/api/pricing` | 견적 단가 |
| `/api/storage/upload·delete` | 파일 업로드/삭제 |

## 환경변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY  # API Route 전용
ANTHROPIC_API_KEY          # Claude
ADDRESS_API_KEY            # 도로명주소 (Juso)
BUILDING_API_KEY           # 건축물대장 (공공데이터포털)
NEIS_API_KEY               # 학교 (NEIS)
```

## docs/ 참조표
| 파일 | 용도 |
|------|------|
| docs/REGISTER.md | 접수대장 스펙 |
| docs/SITE.md | 현장관리 스펙 |
| docs/ESTIMATE.md | 견적서 스펙 |
| docs/CALENDAR.md | 캘린더 스펙 |
| docs/DOCUMENTS.md | 서류함 스펙 |
| docs/PAGES_SPEC.md | 전체 페이지별 화면 스펙 |
| docs/DESIGN.md | 디자인 시스템 |
| docs/REPORT_KPI.md | 보고서 + KPI 배점표 |
| docs/AGENT.md | AI 에이전트 (접수/서류/조회팀 통합) |
| docs/AI_RULES.md | AI 행동규칙 (문지기/비서/분석가 + 대표/직원 규칙) |
| docs/API_ADDRESS.md | 주소/건축물대장 API 연동 가이드 |
| dawoo_db_schema.sql | DB 스키마 |
