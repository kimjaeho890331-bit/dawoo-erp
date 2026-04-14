# DAWOO ERP 업무 방향서

> 마지막 갱신: 2026-04-13 / 기준 브랜치: `feat/register-enhancement`

## 왜 이 문서가 있나

- **CLAUDE.md** = 프로젝트 지도 (철학 · 페이지 · DB · 로드맵 전체)
- **docs/\*.md** = 각 기능별 상세 스펙 (REGISTER, SITE, CALENDAR, REPORT_KPI ...)
- **WORKPLAN.md (이 문서)** = *지금 이 시점*에서 Claude와 뭘 할지. 1장으로 스캔 가능한 현재 상태 + 다음 액션.

---

## 현재 스냅샷

- **Phase 1 (ERP 기본 안정화)**: 대부분 완료. 구현 현황 표는 `CLAUDE.md:288-311` 참조.
- **Phase 2 (서류 자동화 / Cowork + 구글드라이브)**: 미착수.
- **현재 미커밋**: `feat/register-enhancement` 브랜치에 로그인·RLS·미들웨어 관련 8개 파일 변경 있음. (WORKPLAN 범위 밖, 별도 처리)

---

## 다음 우선순위

### P0. 미커밋 브랜치 정리 *(이 문서 범위 밖)*
`feat/register-enhancement`의 로그인/RLS/미들웨어 8개 파일을 먼저 정리·커밋·머지. 아래 P1~P3 착수 전 필수.

### P1. Phase 2 착수 — 서류 자동화 (Cowork × 구글드라이브)
- 구글드라이브 템플릿 폴더 구조 확정 (회사/수도/소규모/입찰 4그룹)
- `cowork_tasks` 테이블 현재 상태를 Supabase MCP로 확인 → 누락 컬럼 있으면 마이그레이션
- ERP → Cowork → Drive 트리거 플로우 PoC 1건
- 참조: `CLAUDE.md` Phase 2 섹션, `docs/DOCUMENTS.md`

### P2. AI 비서 미구현 도구 (`src/app/api/chat/route.ts`)
현재 구현: `search_address` / `get_building_info` / `get_unit_info` / `register_project` / `search_projects` (5개)

추가 필요:
- `update_project` — 접수 정보 수정
- `update_status` — 10단계 상태 변경 (단계 전환 검증 포함)
- `manage_schedule` — 캘린더 일정 CRUD
- `get_dashboard_stats` — 대시보드 통계
- 서류팀 도구군 (`trigger_cowork`, `list_templates`, `check_doc_status`)

참조: `CLAUDE.md:378-383`, `docs/AGENT_REGISTER.md`, `docs/AGENT_DOCS.md`. 스킬 `add-agent-tool` 활용.

### P3. 보고서 / KPI AI 엔진 연동
UI는 5탭/3탭 완료. AI 분석 엔진만 미연동 (`CLAUDE.md:301-302`). 12개 소스 → 총괄AI → 주간/월간/현장마감 3종 보고서 생성 로직.
참조: `docs/REPORT_KPI.md`

---

## Supabase MCP 활용 가이드

세션 시작 시 `.mcp.json`의 `supabase` 서버가 자동 기동된다 (`--read-only` + `--project-ref=etwpcaedbuubjzbfrjli`).

**샘플 프롬프트**:
1. "Supabase MCP로 projects 테이블의 현재 컬럼 나열해줘" — 스키마 파일 vs 실제 DB 싱크 확인
2. "RLS 정책 전체 나열해줘" — 보안 상태 점검
3. "supabase/migrations/001_enable_rls.sql 을 실제 DB 상태와 비교해줘" — 미적용 마이그레이션 검증
4. "최근 7일간 등록된 projects를 시별로 집계해줘" — 실제 데이터 확인
5. "ai_knowledge / ai_memory 테이블이 존재하는지, 존재하면 row 수는?" — Phase 3 AI 기반 준비 상태 확인

**주의**: `--read-only` 플래그로 기동되므로 INSERT/UPDATE/DELETE/DDL은 거부된다. 쓰기 작업은 마이그레이션 파일 작성 → 사람 승인 → `npx supabase db push` 흐름으로.

### 1회성 셋업 (사용자)

1. Supabase Dashboard → Account → Access Tokens → "claude-code-dawoo" PAT 발급
2. 셸 환경변수 등록:
   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   ```
   (Windows PowerShell: `[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','sbp_...','User')`)
3. Claude Code 세션 재시작
4. `/mcp` 슬래시 커맨드로 `supabase` 상태가 `connected` 인지 확인

---

## 기존 슬래시 커맨드

- `/build` — 빌드 + lint 확인
- `/db-check` — DB 스키마 ↔ 코드 타입 일치 확인
  - **TODO**: Supabase MCP 연결 후 "스키마 파일 vs 실제 DB" 비교 모드로 업그레이드 가능

---

## 참조 링크

- [CLAUDE.md](../CLAUDE.md) — 프로젝트 전체 지도
- [dawoo_db_schema.sql](../dawoo_db_schema.sql) — 22개 테이블 스키마
- [docs/AGENT.md](./AGENT.md) — AI 에이전트 총괄
- [docs/REGISTER.md](./REGISTER.md) — 접수대장
- [docs/SITE.md](./SITE.md) — 현장관리
- [docs/REPORT_KPI.md](./REPORT_KPI.md) — 보고서 · KPI
- [docs/CC_WORKFLOW.md](./CC_WORKFLOW.md) — Claude Code 워크플로우
