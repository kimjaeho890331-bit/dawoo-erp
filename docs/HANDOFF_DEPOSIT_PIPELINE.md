# 입금 처리 파이프라인 현재 상태 (Cursor 인계용)

> 작성 시점: 2026-04-20
> 목적: AI 비서 입금 처리가 "2번" 선택 시 "프로젝트를 찾을 수 없습니다"로 실패했던 문제의 현재 상태 정리

## TL;DR
- **원인 1 (해결됨)**: `projects` 테이블에 7개 컬럼 누락 → 저장이 조용히 실패
  - `additional_cost`, `approval_received_date`, `construction_doc_date`, `construction_doc_submitter`, `construction_end_date`, `field_memo`, `area_result`
  - `sql/migration_missing_fields.sql` 푸시 완료 (2026-04-20)
- **원인 2 (확인 필요)**: PostgREST 스키마 캐시
  - 컬럼 추가 후 Supabase가 즉시 반영되지 않는 경우 있음
  - 해결: Supabase Dashboard → Database → `NOTIFY pgrst, 'reload schema'` 실행, 또는 `vercel --prod` 재배포
- **원인 3 (있을 수 있음)**: dev 서버가 옛 빌드 캐시로 도는 상태
  - 해결: `.next` 삭제 후 `npm run dev` 재실행

## 파일 변경 요약 (아직 커밋 안 됨)

### 신규 생성
- `src/lib/payments.ts` — 입금 처리 공통 라이브러리
  - `inferPaymentType(amount, project)` — 금액 기준 payment_type 자동 분류
  - `inferNextStatus(status, collected, project)` — 입금 후 status 자동 전환 룰
  - `applyDepositAndAdvanceStatus({ ... })` — 프로젝트 조회 → 중복체크 → INSERT → 수금/미수금 재계산 → status 전환 → status_log
  - `formatDepositMessage(result)` — 텔레그램/AI 공통 응답 포맷
- `sql/migration_missing_fields.sql` — 누락 컬럼 DDL
- `docs/HANDOFF_DEPOSIT_PIPELINE.md` — 본 문서

### 수정
- `src/app/api/chat/route.ts`
  - `applyDepositAndAdvanceStatus`, `formatDepositMessage` import
  - 모듈 레벨 `_currentStaffName` + `setCurrentStaffName()` (요청별 현재 사용자 컨텍스트)
  - POST 핸들러: `body.staffId`로 staff 조회 → setCurrentStaffName
  - Claude API 호출 시 SYSTEM_PROMPT 끝에 "현재 사용자: {이름}" 주입
  - `matchDeposit` → candidates에 `self_pay`, `city_support`, `additional_cost` 포함
  - `recordDeposit` → 공통 라이브러리 호출 + formatted_message 반환
  - SYSTEM_PROMPT 입금 섹션: confirmer_name 서버 자동주입 안내
- `src/app/api/telegram/webhook/route.ts`
  - `applyDepositAndAdvanceStatus`, `formatDepositMessage` import
  - 입금 확인 callback 핸들러 → 공통 라이브러리 호출로 치환
- `src/components/AISidebar.tsx`
  - POST /api/chat에 `staffId` (localStorage `dawoo_current_staff_id`) 전달
- `src/components/register/ProjectDetailPanel.tsx`
  - 자동저장 실패 시 `saveError` state에 메시지 저장 + 상단 빨간 배너 노출
  - 조용히 실패하지 않도록 alert + 배너 동시 표시

## 처리 파이프라인 (통합)

```
[입금문자 수신]
    ↓
match_deposit(deposit_text)
  - 금액·이름 파싱
  - owner_name/payer_name/note ILIKE 검색 (각 20건)
  - 이름 매칭 실패 시 금액 fallback 안 함
    ↓
후보 0 → "빌라명 알려주세요"
후보 1 → 바로 record_deposit
후보 N → 목록 표시 후 "몇 번인가요?"
    ↓
record_deposit(project_id, amount, payer_name)
  - confirmer_name 서버 자동 주입 (_currentStaffName)
    ↓
applyDepositAndAdvanceStatus()
  1. projects SELECT (id, building_name, owner_name, road_address,
     jibun_address, water_work_type, support_program, note,
     total_cost, collected, outstanding, self_pay, city_support,
     additional_cost, status, cities(name), work_types(name, work_categories(name)))
  2. 중복 체크 (같은 날짜·금액·확인자 → 이미 등록됨)
  3. inferPaymentType() → 자부담착수금 / 추가공사비 / 시지원금잔금
  4. payments INSERT
  5. 누적 수금 재계산 → projects UPDATE (collected, outstanding)
  6. inferNextStatus()
     - collected >= total_cost → '입금'
     - collected >= self_pay && status ∈ {문의~신청서제출} → '승인'
  7. status_logs INSERT (자동전환 시)
    ↓
formatDepositMessage()
    ↓
AI: formatted_message 그대로 사용자에게 노출
텔레그램: sendMessage(chatId, formatted_message)
```

## 검증 케이스 (이대로 실제 DB로 시뮬레이션 가능)

### 케이스 A: 김경숙 150,000원 → 산호하이츠빌라 (실측 → 승인)
```
project_id = 'c83ce25d-60ba-4294-b21e-cdc759e114ea'
amount = 150000

입력 상태:
  self_pay=150000, city_support=1350000, additional_cost=0
  collected=0, total_cost=1570000, status='실측'

기대 결과:
  payment_type = '자부담착수금' (amount === self_pay)
  payments INSERT 성공
  projects.collected = 150000, outstanding = 1420000
  status '실측' → '승인' (self_pay 완납 + PRE_APPROVAL 단계)
  status_logs INSERT
```

### 케이스 B: 김경숙 150,000원 → 영화아트빌 (공사, 이미 자부담 완납)
```
project_id = 'e8a6e6f9-1e3e-48a3-955a-0f6ddd9b3492'
amount = 150000

입력 상태:
  self_pay=1290000, city_support=11610000, additional_cost=0
  collected=1290000, total_cost=12900000, status='공사'

기대 결과:
  payment_type = 추가공사비? 시지원금잔금?
  inferPaymentType 로직 확인 필요:
    - amount !== self_pay(1290000)
    - addC=0 → 추가공사비 스킵
    - cityS>0 && amount(150000) >= cityS*0.8(9288000) → false
    - amount >= total*0.5(6450000) → false
    - fallback: 자부담착수금 (소액)
  ※ 이 케이스는 사실 파편납부 의도가 모호 — 비즈니스 룰 재검토 필요
```

### 케이스 C: 자부담 부분 납부
```
self_pay=500000, already collected=200000, amount=200000
→ "자부담금 부분납부"로 인식돼야 함
→ 현재 로직: amount(200000) <= self-already(300000) → '자부담착수금'
```

## 남은 의심사항 (Cursor가 확인 필요)

### 1. PostgREST 스키마 캐시
DB에 컬럼은 추가됐지만 PostgREST가 인식 못 하는 경우:
```sql
NOTIFY pgrst, 'reload schema';
```
또는 Supabase Dashboard → Settings → API → "Reset API"

### 2. Next.js 빌드 캐시
```bash
rm -rf .next
npm run dev
```

### 3. Vercel 배포 (프로덕션)
최신 코드가 배포되지 않은 상태라면:
```bash
vercel --prod
```

### 4. AI가 "2번" 맥락을 잃어버리는 문제
- 현재 messages 배열에서 이전 assistant 메시지의 tool_use 결과(candidates)를
  다음 턴까지 유지해야 함
- AISidebar가 `updatedMessages.slice(-20)`로 20개 유지 → OK
- 하지만 **tool_result 메시지는 assistant 메시지의 tool_use id와 매칭돼야** Anthropic이 참조함
- 현재 코드가 tool 사용 턴을 모두 `messages`에 쌓는지 확인 필요
- 만약 AI가 candidates id를 기억 못 해서 search_projects를 새로 부른다면,
  이 메시지 히스토리 처리가 누락된 것

### 5. setCurrentStaffName 모듈 레벨 전역 변수
- Next.js serverless 환경에서 모듈 레벨 변수는 요청 간 공유될 수 있어 레이스
- 요청별 격리가 필요하면 AsyncLocalStorage 또는 recordDeposit 인자로 받기 권장

## 🔥 최신 관찰 실패 (2026-04-20)

### 증상
- 웹 AI 비서에 입금 문자 붙여넣음 → `match_deposit` 호출 → 2개 후보 정상 표시
- 사용자가 "2번" 입력 → AI가 **"오류가 발생했습니다. 다시 시도해주세요."** 응답
- SQL 마이그레이션은 이미 적용됨 (`additional_cost` 등 7개 컬럼 DB에 존재 확인)

### 추가된 디버그 로깅 (src/app/api/chat/route.ts)
로그가 `[AI]` / `[AI Tool]` 태그로 터미널에 출력됨:
- `[AI Tool] record_deposit input: {...}` — 도구가 받은 입력
- `[AI Tool] record_deposit result: {...}` — 도구의 반환값
- `[AI Tool] record_deposit threw: ...` — 예외 발생 시 스택트레이스
- `[AI] Claude API error: 500 ...` — Claude API 자체 오류
- `[AI] Last messages: ...` — 실패 직전 메시지 히스토리

### 재현 방법
1. `npm run dev` 로 서버 올리기
2. 브라우저에서 AI 비서 열고 입금 문자 붙여넣기
3. "2번" 입력
4. **dev 서버 터미널** 확인 → `[AI]` / `[AI Tool]` 로그 전체 복사

### 의심 후보 (Cursor가 확인)
1. **`record_deposit`이 아예 호출 안 되고 있을 가능성**
   - AI가 "2번" 맥락에서 `record_deposit` 대신 `search_projects` 호출했을 수 있음
   - 로그에서 "2번" 턴의 tool_use가 뭔지 확인
2. **메시지 히스토리에서 tool_use ↔ tool_result id 미스매치**
   - Anthropic API는 tool_use block의 id로 tool_result를 참조
   - AISidebar가 `updatedMessages.slice(-20)` 할 때 assistant의 tool_use 블록만 들고
     그에 대응하는 user role의 tool_result가 빠지면 API가 400 에러 반환
   - 하지만 웹에서 보내는 messages는 `role: 'user' | 'assistant', content: string` 구조만
     → **tool_use/tool_result는 프론트 messages에 없음**
     → `/api/chat`이 매 요청마다 tool 루프를 새로 돌려야 함
     → 즉, 이전 턴의 match_deposit 결과(candidates IDs)는 **현재 턴 Claude에게 전달 안 됨**
   - ⚠️ **구조적 문제**: 프론트는 text만 저장하므로 "2번"이라는 다음 요청이 들어오면
     Claude는 직전 candidates를 기억 못 함. 다시 match_deposit 돌리거나
     search_projects로 혼란
3. **PostgREST 스키마 캐시**
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

### 제안 해결책 (Cursor가 결정)
**A안: 프론트가 tool_use/tool_result를 통째로 저장**
- AISidebar의 messages 구조 확장
- 무거움

**B안: 후보를 서버 세션에 캐시**
- staffId 기준 Map에 최근 match_deposit 결과 저장
- "2번" 식 숫자 선택이 들어오면 캐시에서 project_id 꺼내서 바로 record_deposit
- 단순함

**C안: AI에게 candidates를 대화 텍스트로 넘겨주기**
- match_deposit 응답 시 candidates의 id를 노출
- AI가 assistant 텍스트에 id 포함하게 프롬프트 유도
- "2번 → id=xxx" 매핑이 대화 본문에 남아 다음 턴에 참조 가능
- Anthropic 권장 패턴과 상충 (보통 tool chain을 한 턴 안에서 끝냄)

**추천: B안**. 구현 간단하고 즉시 해결.

---

## 테스트 체크리스트

- [ ] Supabase에서 `NOTIFY pgrst, 'reload schema'` 실행
- [ ] dev 서버 재시작 (`rm -rf .next && npm run dev`)
- [ ] 웹 AI 비서에 "[Web발신] 2026/04/20 입금 150,000원 김경숙 기업(다우,본점)" 입력
- [ ] 2개 후보 표시 확인
- [ ] "2번" 입력 → formatted_message 응답 확인
- [ ] `payments` 테이블에 row INSERT 됐는지 확인
- [ ] `projects.collected`, `outstanding`, `status` 업데이트 확인
- [ ] `status_logs`에 자동전환 로그 남았는지 확인
- [ ] PaymentTable에 realtime으로 새 row 표시되는지 확인
- [ ] 텔레그램 봇에도 같은 시나리오 테스트
- [ ] 상세모달에서 승인일/공사완료일/착공서류일/추가공사금 입력 → 저장 → 새로고침 → 유지되는지 확인
- [ ] 저장 실패 시 빨간 배너 뜨는지 확인
