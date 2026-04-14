# rls-check

> 모든 DB 테이블의 RLS(Row Level Security) 정책 상태를 점검

## 트리거 조건
- "RLS 확인", "보안 점검", "권한 검사" 등의 요청

## 허용 도구
Read, Grep, Glob, Bash(npx supabase*)

## 절차

### 1. 기준 파일 확인
- `supabase/migrations/001_enable_rls.sql` 읽기 — RLS 기준선
- `dawoo_db_schema.sql` 에서 전체 22개 테이블 목록 추출

### 2. RLS enable 상태 확인
- 각 테이블에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 있는지 확인
- Supabase MCP로 실제 RLS 상태 교차 확인 (가능한 경우)

### 3. 정책 확인
각 테이블에 다음 정책이 있는지 확인:
- **SELECT**: staff는 본인 관련 행만, admin은 전체
- **INSERT/UPDATE/DELETE**: 적절한 권한 제한
- 특수 테이블 예외:
  - `cities`, `work_categories`, `work_types` — 읽기 전용 (모두 SELECT 가능)
  - `ai_knowledge`, `ai_memory` — AI 서비스 계정만 쓰기
  - `activity_log` — 시스템 자동 기록, 관리자만 전체 열람

### 4. 결과 보고
누락/문제를 표로 정리:

```
| 테이블 | RLS 활성 | SELECT 정책 | INSERT 정책 | 비고 |
|--------|---------|------------|------------|------|
| projects | O | O | O | 정상 |
| payments | O | X | X | 정책 누락 |
```

### 5. 수정 SQL 제안
- 누락된 정책에 대한 SQL 제시
- `supabase/migrations/` 에 새 마이그레이션 파일로 작성

## 22개 테이블 체크리스트
staff, cities, work_categories, work_types, projects, payments, status_logs, templates, documents, attachments, schedules, sites, site_tasks, site_logs, site_photos, activity_log, expenses, estimates, kpi_settings, vendors, promo_records, as_records, ai_knowledge, ai_memory, chat_history, cowork_tasks
