# Claude Code 워크플로우 가이드

> 반복 작업별 권장 순서. 어떤 MCP/스킬을 어떤 순서로 쓰는지 정리.

---

## 1. 신규 페이지 추가

```
context7 MCP → Next.js 16 App Router 패턴 확인
  ↓
src/components/<feature>/<Feature>Page.tsx 작성
  ↓
src/app/<route>/page.tsx 라우트 (Page 컴포넌트 import만)
  ↓
chrome-devtools MCP → 실제 페이지 클릭/스크린샷 확인
  ↓
design-lint 스킬 → 이모지/아이콘/색토큰 검사
  ↓
/build → 컴파일 확인
```

## 2. DB 테이블/컬럼 추가

```
supabase-migration 스킬 트리거
  ├─ dawoo_db_schema.sql 읽기
  ├─ supabase/migrations/NNN_<설명>.sql 생성
  ├─ src/types/index.ts 타입 추가
  └─ RLS 정책 포함
  ↓
db-check 스킬 → 타입-스키마 불일치 확인
  ↓
rls-check 스킬 → 보안 정책 검증
  ↓
사용자가 Supabase Studio에서 SQL 적용
  ↓
/build → 컴파일 확인
```

## 3. AI 비서 도구 추가

```
add-agent-tool 스킬 트리거
  ├─ src/app/api/chat/route.ts 에 tool 추가
  ├─ input_schema + handler 작성
  ├─ docs/AGENT_*.md 문서 갱신
  └─ CLAUDE.md "구현 완료 도구" 표 갱신
  ↓
/build → 컴파일 확인
```

## 4. UI 디자인 변경

```
컴포넌트 수정
  ↓
design-lint 스킬 → 이모지/아이콘/색토큰 검사
  ↓
chrome-devtools MCP → 라이트/다크 모드 양쪽 스크린샷
  ↓
/build → 컴파일 확인
```

## 5. 버그 리포트 처리

```
github MCP → issue 조회 (상세 내용 확인)
  ↓
재현 → 원인 파악 → 수정
  ↓
/build → 컴파일 확인
  ↓
커밋 → push (Stop 훅이 미커밋 상태 차단)
```

## 6. RLS/보안 점검

```
rls-check 스킬 → 22개 테이블 전체 점검
  ↓
supabase MCP → 실제 DB의 RLS 상태 교차 확인
  ↓
누락된 정책은 supabase-migration 스킬로 SQL 작성
```

---

## MCP 서버 요약

| MCP | 주요 사용 시점 |
|-----|--------------|
| supabase | DB 스키마 조회, 테이블 구조 확인, RLS 검증 |
| chrome-devtools | UI 변경 후 시각적 확인, 콘솔 에러 캡처 |
| context7 | Next.js 16 / Supabase / Tailwind v4 문서 필요 시 |
| github | issue 조회, PR 생성, 코드 리뷰 |

## 환경변수 (사용자 직접 추가)

`.env.local`에 아래 2개 추가 필요:
```
SUPABASE_ACCESS_TOKEN=sbp_xxxxx    # supabase.com → Settings → Access Tokens
GITHUB_TOKEN=ghp_xxxxx             # github.com → Settings → Developer settings → Personal access tokens
```
