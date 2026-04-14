# db-check

> DB 스키마와 TypeScript 타입의 일치 여부를 확인
> 기존 `.claude/commands/db-check.md`의 스킬 버전

## 트리거 조건
- "타입 일치", "스키마 동기화", "DB 체크", "타입 확인" 등의 요청
- `supabase-migration` 스킬 실행 후 자동 연계

## 허용 도구
Read, Grep, Glob

## 절차

### 1. DB 스키마 읽기
- `dawoo_db_schema.sql` 에서 모든 CREATE TABLE 문 추출
- 각 테이블의 컬럼명, 타입, NOT NULL, DEFAULT 파악

### 2. TypeScript 타입 읽기
- `src/types/index.ts` 에서 모든 interface/type 추출
- DB 테이블과 매핑되는 타입 식별

### 3. 불일치 검사
| 검사 항목 | 설명 |
|----------|------|
| 컬럼 누락 | DB에는 있지만 TS 타입에 없는 필드 |
| 타입 불일치 | `TEXT` ↔ `string`, `INTEGER` ↔ `number`, `BOOLEAN` ↔ `boolean`, `TIMESTAMPTZ` ↔ `string` |
| nullable 불일치 | DB `NOT NULL` vs TS optional(`?`) |
| 타입 미존재 | DB 테이블은 있지만 대응 TS 타입이 없음 |

### 4. API 함수 확인
- `src/lib/api/*.ts` 에서 Supabase 쿼리가 올바른 컬럼명 사용하는지 확인
- `.select()`, `.insert()`, `.update()` 호출의 필드명 교차 검증

### 5. 결과 보고
```
| 테이블 | TS 타입 | 상태 | 불일치 내용 |
|--------|---------|------|------------|
| projects | Project | ⚠️ | phone 컬럼 TS에 누락 |
| staff | Staff | ✅ | 일치 |
```

### 6. 수정 제안
- 불일치 항목에 대해 TS 타입 수정 코드 제시
- `/build` 로 컴파일 확인 권장
