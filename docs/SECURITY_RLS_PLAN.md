# RLS 설계안 (ENABLE는 Stage 2)

이 문서는 정책 설계와 적용 순서를 적는다. **Stage 2 배포 확인 전에는 `ENABLE ROW LEVEL SECURITY`를 추가로 적용하지 않는다.**
이미 켜진 테이블의 RLS를 끄지도, 꺼진 테이블에 ENABLE 마이그레이션을 넣지도 않는다.

## 단계

| 단계 | 상태 | 내용 |
|------|------|------|
| **Stage 1** | **완료** | 화면 데이터 읽기/쓰기가 AuthProvider와 같은 `@supabase/ssr` 쿠키 세션 클라이언트(`createBrowserSupabaseClient` → `src/lib/supabase.ts`)를 쓴다. 로그인 JWT가 `from(...)` 요청에 실린다. 로그아웃이면 staff 세션 JWT가 없다. 이 단계에서는 ENABLE RLS / `schedules`·`sites` 정책 조이기 없음. |
| **Stage 2** | **대기** | Stage 1을 배포한 뒤, 로그인 화면이 실제로 보이는지 확인한 다음에만 staff-session 정책을 적용한다. **anon은 empty/deny** — 로그인 JWT가 없는 요청은 회사 데이터가 비어 있거나 거절되어야 한다. ENABLE은 그때, 테이블 하나씩. |

Stage 2를 지금 하면 안 되는 이유: 클라이언트를 바꿔도 배포·실로그인 확인 전에 정책을 조이면, JWT가 빠지거나 쿠키가 안 실리는 환경에서 ERP 전체가 빈 화면이 된다. `schedules`/`sites` 기존 정책도 아직 조이지 않는다.

화면 데이터는 `src/lib/supabase.ts` 세션 브라우저 클라이언트다. 꺼진 테이블에 RLS를 지금 켜면, 배포 확인 전에 JWT가 빠지는 환경에서 접수대장·지출·직원·거래처가 빈 화면이 된다.

- 이 PR에서 마이그레이션으로 ENABLE 하지 않는다.
- `supabase/migrations/007_rls_all_tables.sql`을 재실행하지 않는다.
- 테이블 DROP 하지 않는다.
- SQL 초안은 주석/`docs/security/rls-draft.sql`만. 적용 SQL이 아니다.

## 운영 현황 (조사 시점 기준, ENABLE 추가 금지)

| RLS | 테이블 |
|-----|--------|
| **on** | `credential_entries`, `schedules`, `sites` |
| **off** | `activity_log`, `expense_reports`, `expense_report_payments`, `expense_report_lines`, `expense_report_files`, `expenses`, `notices`, `projects`, `staff`, `staff_emails`, `vendors` |

- `expense_report_details` / `expense_report_refs` / `doc_sequences` 등 위 목록 밖은 **미확인**. 조사 항목.
- `credential_entries`는 022 의도와 같이 **REVOKE anon/authenticated + service_role만**일 가능성이 크다. 실제 GRANT/REVOKE·정책 이름은 아래 조사 항목.
- `schedules` / `sites`는 RLS on이다. Stage 1부터 화면은 세션 클라이언트로 읽는다. **정책이 열려 있거나(예: `USING (true)`), 다른 우회가 있는지 조사 필요.** 지금은 정책을 조이지 않는다.

### 조사 항목 (Studio / `pg_policies` — 아직 실행하지 말 것)

운영에서 확인할 것. 이 PR에서 SQL로 ENABLE/REVOKE 하지 않는다.

1. `pg_tables.rowsecurity` — 위 on/off와 일치하는지.
2. `credential_entries` — `pg_policies` 정책 목록(없으면 “정책 없음 + REVOKE” 패턴). `information_schema.role_table_grants`에서 anon/authenticated/service_role.
3. `schedules`, `sites` — 정책 이름·역할·`USING`/`WITH CHECK`. anon SELECT가 왜 살아 있는지.
4. RLS off 테이블 — GRANT가 PUBLIC/anon에 열려 있는지.
5. 미확인: `expense_report_details`, `expense_report_refs`, `doc_sequences`, `site_tasks` / `site_logs` / `site_photos`.

## 왜 Stage 2(ENABLE/조이기)는 배포 확인 뒤에만

1. **Stage 1 완료.** 프론트 데이터 클라이언트는 Auth와 같은 `@supabase/ssr` 쿠키 세션이다. 로그인하면 JWT가 실린다. 로그아웃(anon)은 staff 세션이 없다. 아직 대부분의 테이블은 RLS off라 anon도 행을 볼 수 있다 — Stage 2에서 anon empty/deny로 바꾼다.
2. 서버 API는 민감 작업에 `SUPABASE_SERVICE_ROLE_KEY`를 쓴다(아래 목록). service_role은 RLS를 우회한다.
3. 과거 `001_enable_rls.sql` / `007_rls_all_tables.sql`은 `authenticated USING (true)`라, JWT가 빠진 anon 경로와 충돌한다. 운영 on/off는 그 파일과 **이미 다르다.**
4. `staff_emails`는 015에서 RLS를 의도적으로 끄고 만들었고, 운영도 off다.

전제: Stage 1 배포 후 로그인 SELECT가 살아 있는지 확인한 뒤에만 정책을 조인다. **off → on ENABLE는 Stage 2.** anon은 empty/deny.

## 테이블별 목표

| 테이블 | 운영 RLS | 목표 | 앱 경로 | 나중에 |
|--------|----------|------|---------|--------|
| `credential_entries` | on | anon/authenticated REVOKE, service_role만 | API만 (`/api/ids*`) | 정책/GRANT 조사 후 유지. ENABLE 추가 없음. 비밀번호는 앱 암호화 |
| `schedules` | on | 로그인 직원 | 화면 세션 클라이언트 CRUD | 정책 조사만. 조이기/ENABLE 추가 금지 |
| `sites` | on | 로그인 직원. 신규 insert는 API | 목록/수정 세션 클라이언트, POST `/api/sites`는 service_role | 정책 조사만. 목록 API 이전 뒤에 조이기 |
| `staff` | off | 읽기: 로그인. 쓰기: 관리자 또는 service_role | 화면 세션 `select *` | ENABLE 하지 말 것. Stage 2에서 검토 |
| `staff_emails` | off | service_role만 | 로그인 매핑 API | ENABLE 하지 말 것. 이후 REVOKE+API만 |
| `expense_reports` + `_payments` `_lines` `_files` | off | service_role만 (결재 API) | `/api/approval/*` | ENABLE 하지 말 것 |
| `expenses` | off | 로그인 직원 또는 API만 | 화면 세션 CRUD + 일부 API | ENABLE 하지 말 것 |
| `projects` | off | 로그인 직원 | `src/lib/api/projects.ts` 등 세션 클라이언트 | ENABLE 하지 말 것 |
| `vendors` | off | 로그인 직원 | 화면 세션 CRUD | ENABLE 하지 말 것 |
| `notices` (선택) | off | 읽기: 로그인. 쓰기: 관리자 | 화면 세션 CRUD | ENABLE 하지 말 것 |
| `activity_log` | off | insert: 로그인+staff_id. select: 로그인 | `/api/activity-log` + 화면 fallback 세션 | ENABLE 하지 말 것. fallback 제거가 먼저 |

`doc_sequences`는 채번용 — 목표 service_role만. 운영 RLS는 미확인.

## 적용 순서 (Stage 1 완료 / Stage 2는 배포 확인 후)

1. 위 조사 항목으로 정책/GRANT를 적는다. **지금은 ENABLE 실행 없음.**
2. **완료 (Stage 1).** 프론트 데이터 클라이언트는 로그인 JWT가 실리는 `@supabase/ssr` 세션 클라이언트다. (`createBrowserSupabaseClient`)
3. **Stage 2 직전.** 화면마다 로그인 상태로 SELECT가 살아 있는지 배포에서 확인한다. 그 다음 정책 적용 후 로그아웃(anon)은 빈 결과/거절이어야 한다.
4. 이미 on인 `credential_entries`는 GRANT/정책만 확인·유지(REVOKE 패턴이면 유지).
5. 이미 on인 `schedules` / `sites`는 정책이 열린 이유를 확인한 뒤, API 이전 후에만 조인다. ENABLE를 다시 치지 않는다.
6. off인 `staff_emails` · `expense_*` · `staff` · `projects` · `vendors` · `expenses` · `activity_log` · `notices`는 **Stage 1 배포 확인 전에는 ENABLE 하지 않는다.**

한 테이블씩. 깨지면 그 테이블만 롤백한다. 전 테이블 일괄 ENABLE 금지.

## 롤백

정책만 되돌린다. 테이블 DROP 금지.

```sql
-- 예시(실행하지 말 것). 깨진 테이블만.
-- DROP POLICY IF EXISTS <policy> ON <table>;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated;
-- 과거 007을 켠 적 있으면: ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
```

앱 롤백: 해당 API/클라이언트를 이전 커밋으로 되돌린다.

## service_role을 쓰는 API 요약

| 경로/모듈 | 테이블(대표) |
|-----------|----------------|
| `/api/ids`, `/api/ids-private` | `credential_entries`, `staff`, `staff_emails` |
| `/api/ids/reencrypt` | 관리자만. `CREDENTIAL_SECRET` 없으면 503(행 조회·갱신 없음) |
| `/api/approval/*` | `expense_*`, `expenses`, `staff` |
| `/api/activity-log` POST | `activity_log`, `staff` |
| `/api/sites` POST | `sites` |
| `/api/status-logs` | `status_logs`, `staff` |
| `/api/storage/upload`·`delete` | Storage + `projects` |
| `/api/chat`, `/api/chat/sessions`, `/api/chat/history` | `projects`, `sites`, `schedules`, `expenses`, `vendors`, `staff`, `activity_log` 등 |
| `/api/ai/brief`, `/api/ai/briefing`, `/api/ai/weekly-report`, `/api/dashboard/briefing` | `projects` 등 |
| `/api/building-ledger/*` | `building_ledger_requests`, `projects`, `staff` |
| `/api/auth/link-staff`, `/api/staff/link-account` | `staff`, `staff_emails` |
| `/api/cowork/tasks/*` | `cowork_tasks`, `projects` |
| `/api/certificate/request` | `projects`, `staff` |
| `/api/weather` | `sites` |
| `/api/pricing` | 단가 |
| `/api/telegram/webhook` | `projects` 등 (`src/lib/payments.ts`) |
| `/api/push/subscribe` | `push_subscriptions` |
| `src/app/auth/callback` | `staff` |

로그인만 확인하고 쓰는 경로(`/api/activity-log` GET, `/api/sites` POST의 auth)와, 화면 세션 클라이언트 직접 접근이 섞여 있다. Stage 2에서 RLS를 켜려면 anon empty/deny와 service_role API 경로를 테이블마다 맞춘다.

## 하지 말 것

- 꺼진 테이블에 ENABLE RLS 마이그레이션 추가/실행
- 이미 켜진 테이블에 ENABLE를 다시 치기
- 007 일괄 스크립트 재실행
- 운영에서 REVOKE만 먼저 하고 화면을 안 확인하는 것
- 비밀번호·키를 정책/주석/로그에 적는 것
