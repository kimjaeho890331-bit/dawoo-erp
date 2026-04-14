# supabase-migration

> DB 테이블/컬럼 추가, 스키마 변경 시 자동 트리거

## 트리거 조건
- "테이블 추가", "컬럼 추가", "스키마 변경", "DB 변경" 등의 요청

## 허용 도구
Read, Write, Grep, Glob, Bash(npx supabase*)

## 절차

### 1. 현재 스키마 확인
- `dawoo_db_schema.sql` 읽기
- 변경 대상 테이블의 현재 구조 파악
- Supabase MCP로 실제 DB 상태 교차 확인 (가능한 경우)

### 2. 마이그레이션 SQL 작성
- `supabase/migrations/` 에 `NNN_<설명>.sql` 형식으로 생성
- 기존 마이그레이션 파일 번호 확인 후 다음 번호 사용
- 적용 SQL + 롤백 SQL 둘 다 포함 (롤백은 주석으로)

```sql
-- 적용
ALTER TABLE projects ADD COLUMN customer_phone TEXT;

-- 롤백 (필요 시 수동 실행)
-- ALTER TABLE projects DROP COLUMN customer_phone;
```

### 3. RLS 정책 추가
- 새 테이블이면 RLS enable + 기본 정책:
  - `staff` 역할: 본인 행만 (staff_id = auth.uid() 또는 담당자)
  - `admin` 역할: 전체 접근
- `supabase/migrations/001_enable_rls.sql` 패턴 참고

### 4. TypeScript 타입 동기화
- `src/types/index.ts`에 대응하는 타입/인터페이스 추가 또는 수정
- 기존 타입 패턴과 일관성 유지

### 5. dawoo_db_schema.sql 업데이트
- 새 테이블/컬럼을 스키마 파일에도 반영
- 주석으로 용도 설명 추가

### 6. 검증
- `/db-check` 실행하여 타입-스키마 불일치 확인
- `/build` 로 컴파일 에러 없는지 확인

## 주의사항
- 운영 DB에 직접 실행하지 않음 — SQL 파일만 작성하고 사람이 Supabase Studio에서 적용
- 기존 데이터 있는 컬럼 타입 변경 시 반드시 사용자에게 경고
- NOT NULL 컬럼 추가 시 DEFAULT 값 필수
