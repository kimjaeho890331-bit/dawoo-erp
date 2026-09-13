# RLS 설계안 (실행 금지)

이 문서는 설계만 한다. **지금은 `ENABLE ROW LEVEL SECURITY`를 운영에 적용하지 않는다.**
화면 대부분이 `src/lib/supabase.ts` anon 클라이언트(세션 JWT 없음)로 직접 SELECT/INSERT/UPDATE/DELETE 한다.
여기에 RLS를 켜면 접수대장·현장·캘린더·지출이 빈 화면이 된다.

- 이 PR에서 마이그레이션으로 ENABLE 하지 않는다.
- `supabase/migrations/007_rls_all_tables.sql`을 재실행하지 않는다.
- 테이블 DROP 하지 않는다.
- SQL 초안은 주석/`docs/security/rls-draft.sql`만. 적용 SQL이 아니다.

## 왜 지금은 켜면 깨지나

1. 프론트 데이터 클라이언트는 anon 키 + persistSession off다. 로그인 쿠키 JWT가 실리지 않는다.
2. 서버 API는 민감 작업에 `SUPABASE_SERVICE_ROLE_KEY`를 쓴다(아래 목록). service_role은 RLS를 우회한다.
3. 과거 `001_enable_rls.sql` / `007_rls_all_tables.sql`은 `authenticated USING (true)`라 anon 경로와 충돌한다.
4. `staff_emails`는 015에서 RLS를 의도적으로 끄고 만들었다. `credential_entries`만 API(service_role) + REVOKE anon/authenticated가 이미 맞다.

전제: 프론트를 `@supabase/ssr` 세션 클라이언트로 바꾸거나, 민감 테이블 CRUD를 API로 옮긴 뒤에만 정책을 조인다.

## 테이블별 목표

| 테이블 | 목표 | 지금 | 나중에 |
|--------|------|------|--------|
| `credential_entries` | anon/authenticated REVOKE, service_role만 | 022에서 이미 이 방향 | 유지. 비밀번호는 앱 암호화 |
| `staff` | 읽기: 로그인 직원. 쓰기: 관리자 또는 service_role | 화면이 anon으로 `select *` | 세션 클라이언트 후 `authenticated` SELECT. email은 컬럼 제한 검토 |
| `staff_emails` | service_role만 | RLS 없음. 로그인 매핑 | REVOKE anon/authenticated. API만 |
| `expense_reports` 및 `_payments` `_details` `_lines` `_files` `_refs` | service_role만 (결재 API) | `/api/approval/*`가 admin 클라이언트 | REVOKE 후 API 유지 |
| `expenses` | 로그인 직원 CRUD. 또는 API만 | 화면 anon CRUD + 일부 API insert | 세션 클라이언트 또는 `/api`로 이전 후 정책 |
| `sites` | 로그인 직원. 신규 insert는 이미 API | 목록/수정은 anon, POST `/api/sites`는 service_role | 목록도 API로 옮긴 뒤 staff/역할 정책 |
| `projects` | 로그인 직원 | `src/lib/api/projects.ts` 등 anon | 세션 또는 API 이전 후 정책 |
| `vendors` | 로그인 직원 | 화면 anon CRUD | 동일 |
| `schedules` | 로그인 직원 | 화면 anon CRUD | 동일 |
| `notices` (선택) | 읽기: 로그인. 쓰기: 관리자 | 화면 anon CRUD | 선택 적용 |
| `activity_log` | insert: 로그인+staff_id. select: 로그인 | POST/GET `/api/activity-log` + 화면 fallback anon | fallback 제거 후 REVOKE anon |

`doc_sequences`는 채번용 — service_role만.

## 적용 순서 (나중)

1. 프론트 데이터 클라이언트를 로그인 JWT가 실리는 클라이언트로 바꾸거나, 민감 테이블을 API만 쓰게 옮긴다.
2. 화면마다 로그인 상태로 SELECT가 살아 있는지 확인한다. 로그아웃(anon)은 빈 결과여야 한다.
3. `credential_entries` · `staff_emails` · `expense_*` · `doc_sequences`부터 REVOKE + 정책(또는 정책 없이 service_role만).
4. `staff` 컬럼 노출을 줄인 뒤 나머지 업무 테이블(`projects`, `sites`, `schedules`, `vendors`, `expenses`).
5. `activity_log` anon fallback 제거 후 정책.
6. `notices`는 선택.

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
| `/api/ids`, `/api/ids-private`, `/api/ids/reencrypt` | `credential_entries`, `staff`, `staff_emails` |
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

로그인만 확인하고 쓰는 경로(`/api/activity-log` GET, `/api/sites` POST의 auth)와, 화면 anon 직접 접근이 섞여 있다. RLS를 켜려면 이 두 경로를 먼저 하나로 맞춘다.

## 하지 말 것

- 지금 ENABLE RLS 마이그레이션 추가/실행
- 007 일괄 스크립트 재실행
- 운영에서 REVOKE만 먼저 하고 화면을 안 확인하는 것
- 비밀번호·키를 정책/주석/로그에 적는 것
