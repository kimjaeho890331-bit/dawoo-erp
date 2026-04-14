# add-agent-tool

> AI 비서에 새 도구(tool) 1개를 추가하는 표준 절차

## 트리거 조건
- "AI 도구 추가", "tool 추가", "에이전트 기능 확장" 등의 요청

## 허용 도구
Read, Edit, Write, Grep, Glob

## 현재 구현된 도구 (5개)
- `search_address` — 도로명/지번 주소 검색
- `get_building_info` — 건축물대장 표제부 조회
- `get_unit_info` — 건축물대장 전유부 조회
- `register_project` — 접수대장 신규 등록
- `search_projects` — 접수대장 검색/조회

## 절차

### 1. 기존 패턴 확인
- `src/app/api/chat/route.ts` 읽기
- 기존 도구의 `input_schema`, handler 패턴 파악
- 새 도구가 속할 팀 확인 (접수/서류/조회/공통)

### 2. input_schema 작성
```typescript
{
  name: "tool_name",
  description: "도구 설명 (한국어)",
  input_schema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "파라미터 설명" }
    },
    required: ["param1"]
  }
}
```

### 3. tool handler 함수 작성
- `src/app/api/chat/route.ts` 내 기존 핸들러와 동일 구조
- Supabase 쿼리 시 `createClient(url, service_role_key)` 사용
- 에러 핸들링 포함

### 4. tools 배열에 등록
- `tools` 배열에 새 도구 추가
- `tool_use` 응답 처리 switch/if문에 핸들러 연결

### 5. 문서 갱신
- `docs/AGENT.md` — 전체 도구 목록에 추가
- `docs/AGENT_REGISTER.md` 또는 `docs/AGENT_DOCS.md` 또는 `docs/AGENT_QUERY.md` — 해당 팀 문서에 명세 추가
- `CLAUDE.md` — "구현 완료 도구" 표 갱신 (개수 + 목록)

### 6. 검증
- `/build` 로 컴파일 확인
- AI 비서에 해당 도구 호출 시나리오 테스트 방법 안내

## 주의사항
- 도구 이름은 snake_case
- description은 한국어 (사용자가 한국어 화자)
- AI가 "애매하면 되물어보기" 원칙 — 필수 파라미터 누락 시 확인 요청하도록 시스템 프롬프트 반영
- 기존 5개 도구와 일관된 응답 형식 사용
