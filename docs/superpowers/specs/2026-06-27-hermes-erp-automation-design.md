# 다우건설 ERP × Hermes Agent 자동화 — 설계 문서 (초안)

> 작성일: 2026-06-27
> 상태: **초안 (review 대기)**
> 작성: Claude (brainstorming 세션)
> 대상 독자: 비개발자 포함 (이사님·담당자), 향후 구현 참고

---

## 1. 배경 (현재 상태)

- **DAWOO ERP**: 정부 지원사업(수도/소규모) 접수~수금 자동화 + 건설 현장관리. Next.js 16 + React 19 + TypeScript + Tailwind v4 / Supabase(PostgreSQL·Auth·Storage) / Claude API / Vercel.
- **인원**: 대표 1명(김재호) + 직원 5명 = 6명. 경기 15개 시 대상.
- **현재 AI**: ERP 안에 **인앱 AI 비서**(`/api/chat`, 1,732줄, Claude tool use) + **텔레그램 봇**. 둘 다 `src/lib/payments.ts` 같은 공용 업무 로직을 호출하는 "공용 코어 + 멀티채널" 구조.
- **현재 접수 업무 흐름**: 고객 유선/메시지 문의 → 담당자가 유선 상담 → 고객정보를 **카카오톡으로 수신** → 담당자가 **ERP에 수동 입력**.
- **알려진 구조적 한계**(문서화됨): 서버리스(Vercel)라 AI가 턴 사이 맥락을 잃음(프론트가 텍스트만 저장), 모듈 전역변수 레이스 등.

## 2. 목표

이사님 지시: **ERP와 Hermes agent를 연동해 ERP 자동화를 구축**한다.

1. ERP의 **인앱 AI 비서를 완전히 제거**하고 **Hermes agent로 대체**한다. (방향 A)
2. 사람과 에이전트의 창구로 **Slack**을 사용한다.
3. Hermes를 **상시 구동 서버**에 올린다.
4. **Obsidian**을 연동해 Hermes의 **자가학습**을 강화한다.
5. **6명 인원에 맞는** 구조로 재구축한다.

## 3. 확정 결정 (이번 세션에서 합의)

| # | 항목 | 결정 |
|---|------|------|
| D1 | Hermes 정체 | **Nous Research `hermes-agent`** (오픈소스 MIT, Python). 멀티 메신저 게이트웨이(Slack 네이티브), 모델 자유, 내장 cron, MCP 연동, 스킬/기억, 자가개선 루프 |
| D2 | 연동 방향 | **A — 완전 대체.** 인앱 `/api/chat`·AISidebar·텔레그램 봇 제거 → Slack + Hermes로 일원화 |
| D3 | 도구 로직 | "대체"가 로직을 버리는 게 아님. `/api/chat`의 도구 핸들러(`payments.ts` 등)를 **ERP MCP 서버로 이전·재사용**. 없애는 건 채팅 UI와 Claude tool-use 배선뿐 |
| D4 | 모델 | **Claude 유지** (현재 ERP가 쓰던 그대로). Hermes는 모델 교체 자유라 추후 변경 가능 |
| D5 | 서버 | **작은 클라우드 VPS + 도커, 상시 구동** (월 1만원대). 자동화의 생명은 "항상 켜짐" |
| D6 | Obsidian | **git 동기화 볼트**(서버↔데스크톱). **2계층 기억**(지식 vs 거래데이터) |
| D7 | Obsidian 운영방식 | **llm-wiki 방법론**(Hermes 번들 스킬) 채택. 단 "지식 위키"로만, 거래데이터는 Supabase |
| D8 | 카카오톡 접수 | **A — 담당자가 Slack으로 전달**(텍스트 붙여넣기 또는 스크린샷→Vision 파싱). 개인 카카오톡은 직접 읽는 공개 API가 없음 |

## 4. 목표 아키텍처

```
        대표 1 + 직원 5 (6명)
                 ↕   (Slack: 개인 DM + 공용채널 #접수 #현장 #보고 #알림)
              [ Slack ]
                 ↕
   ┌──────────────────────────────────────────┐
   │  Hermes Agent  — VPS · 도커 (상시 구동)    │   모델: Claude
   │  게이트웨이 │ 에이전트 루프 │ cron │ 스킬·기억 │
   └───────┬───────────────────────┬──────────┘
           │ (MCP/도구 호출)         │ (파일 R/W, 자가학습)
   ┌───────┴────────┐       ┌───────┴──────────────────┐
   │ ERP (Vercel)   │       │ Obsidian 볼트 = llm-wiki  │
   │ · 화면(사람용)  │       │ (git 동기화, 지식 계층)    │
   │ · ERP MCP 서버 │       │ SCHEMA·index·log +        │
   │ · Supabase 데이터│      │ 거래처/시청/고객/노하우 페이지│
   │ (인앱 AI 제거)  │       └──────────────────────────┘
   └───────┬────────┘
           │
   외부 API (주소 · 건축물대장 · NEIS)
```

- **ERP = 손발 + 진실원천**, **Hermes = 두뇌**, **Slack = 입과 귀**, **Obsidian = 학습 지식**.

## 5. 컴포넌트와 책임

### 5.1 Slack (사람 창구)
- 직원 6명 각자 **개인 DM**으로 Hermes와 업무. 공용 채널: `#접수` `#현장` `#보고`(대표 위주) `#알림`(문지기 경고).
- 인앱 AI 사이드패널 + 텔레그램 봇을 **대체**.
- 보안: Hermes의 DM pairing/allowlist로 **승인된 6명 Slack ID만** 허용.

### 5.2 Hermes Agent (두뇌, VPS·도커)
- **게이트웨이**: Slack 연결(단일 프로세스). 추후 텔레그램 등 추가 가능.
- **에이전트 루프**: Claude 모델 + tool use. 상시 구동이라 대화 상태·맥락 유지(서버리스 한계 해소).
- **cron 스케줄러**: 보고 4종(긴급·주간 월요일·월간 1일·현장마감) + 문지기 알림(서류누락·미수금 D+·공정지연)을 자연어 스케줄로.
- **스킬·기억 루프**: ERP 도구 호출, Obsidian(llm-wiki) 읽기/쓰기, 자가개선.

### 5.3 ERP MCP 서버 (ERP ↔ Hermes 연동)
- `/api/chat`의 기존 도구 핸들러를 **MCP 서버로 재노출**(로직 재사용): `search_address`, `get_building_info`, `get_unit_info`, `register_project`, `search_projects`, 입금 처리(`applyDepositAndAdvanceStatus`), 그리고 신규 `update_project`/`update_status`/`manage_schedule`/`get_dashboard_stats`.
- 인증: 기존 `/api/cowork/*`의 **Bearer 토큰 자체검증 패턴** 확장. Hermes가 토큰 보유.
- 저장 전 **`validateProjectData()`** 검증 유지(DB 오염 방지).

### 5.4 ERP (화면 + 데이터) — 거의 유지
- Next.js 화면(사람용 입력·조회), Supabase 22개 테이블(진실원천)은 **그대로**.
- **제거 대상**: `src/components/AISidebar.tsx`, `/api/chat` Claude tool-use 배선, 텔레그램 봇(`/api/telegram/*`). (단계적, 무중단)

### 5.5 Obsidian 볼트 = llm-wiki (학습 지식 계층)
- Karpathy llm-wiki 패턴(Hermes 번들 스킬)으로 운영. 구조: `SCHEMA.md`(회사 도메인 규칙·태그), `index.md`, `log.md`, `raw/`(원본 불변), `entities/`(거래처·고객·시청·현장), `concepts/`(공사종류 노하우·지원사업 규칙·단가/계절 패턴), `comparisons/`, `queries/`.
- 서버(VPS)가 쓰고 데스크톱 Obsidian이 읽음 → `obsidian-headless` 또는 git 동기화. `WIKI_PATH` = `OBSIDIAN_VAULT_PATH` 동일 폴더.

### 5.6 외부 API — 유지
- 주소(Juso), 건축물대장(표제부·전유부), NEIS. Hermes 도구 또는 ERP 경유로 호출.

## 6. 핵심 데이터 흐름

### Flow 1 — 접수 자동화
1. 담당자 유선 상담(사람의 강점 유지) → 고객정보 카톡 수신 → **Slack에 전달**(텍스트 또는 스크린샷).
2. Hermes가 파싱(스크린샷이면 Claude Vision) → `search_address` → `get_building_info` → `get_unit_info` → `register_project`로 **자동 등록 + 외부 API 자동 조회**.
3. 등록 결과를 Slack **확인카드**로 제시 → 사람 확인.
- 대부분 **기존 파이프라인 재사용**.

### Flow 2 — 공문 자동생성 (지원신청·착공·준공)
- 파이프라인 단계 전환 시(신청서제출/착공계/완료서류) Hermes가 공문 초안 자동 작성 → **사람 승인 후** 드라이브 저장.
- **지역×연도 변동성 해결**(별도 섹션 7).
- **고위험 → 절대 자동제출 금지.** 작성까지 자동, 제출 결정은 사람(문지기).

### Flow 3 — 입금 처리
- 입금 문자 Slack 붙여넣기 → `match_deposit` → 후보 확인 → `record_deposit` → `applyDepositAndAdvanceStatus`(중복체크·수금/미수금 재계산·단계 자동전환·status_log). **기존 `payments.ts` 재사용.**

### Flow 4 — 리포트 / 알림 (Hermes cron)
- 보고 4종 + 문지기 알림을 cron으로 생성 → Slack 채널/DM 전송. 기존 `/api/notifications/cron/*`를 Hermes cron으로 이전.

### Flow 5 — 자가학습 루프 (llm-wiki)
- 업무 발생 → Hermes가 새 사실/교훈을 위키에 기록(ingest) → 사람이 Obsidian에서 큐레이션 → 다음 업무에서 위키 근거로 답·작업(query) → 정기 lint(모순·낡은 정보·고아 페이지 점검).

## 7. 공문 지역×연도 변동성 해결

문제: 공문은 **[15개 시] × [문서종류] × [연도]** 행렬이고, ① 양식 레이아웃(지역별 상이) ② 지원률·자격·단가(매년 변동) ③ 변경 주기(매년 or 작년 그대로)가 각자 다르게 변함.

**원칙: 템플릿을 코드에 하드코딩하지 않는다. 변하는 지식은 사람이 매년 다듬는 Obsidian에, 생성 엔진(Hermes)은 그대로.**

| 무엇 | 어디에 | 누가 관리 |
|------|--------|----------|
| 양식 파일 (시×문서×연도 버전) | Storage/Drive 버전 보관. 새 양식 오면 Hermes가 폼필드 **의미기반 자동분석·매핑** | Hermes + 사람 확인 |
| 연도별 규칙(지원률·자격·단가) | Obsidian `concepts/지원사업/{연도}/{시}.md`(프론트매터로 기계가 읽게) | **사람이 매년 초 큐레이션** |
| 프로젝트 데이터 | Supabase | 진실원천 |

**자가 유지보수 루프**: 새 양식 투입 → Hermes가 작년 버전과 **diff**("X 필드 추가, 지원률 70%→65%, 나머지 동일") → **사람은 변경분만 확인** → 매핑·규칙 갱신. **변경 없으면 작년 그대로 자동 재사용(작업 0).**

**안전장치**: 시청 제출 공문은 초안+근거(어떤 연도 규칙·데이터 사용) 제시 → 사람 승인. 자동 제출 금지.

## 8. 2계층 기억 원칙 (중요)

| 저장소 | 담는 것 | 성격 |
|--------|--------|------|
| **Supabase** | projects·payments·schedules 등 거래 데이터 | 진실원천·실시간·구조적 |
| **Obsidian(llm-wiki)** | 회사규칙·SOP·거래처평가·별칭·계절패턴·현장복기·지원사업 규칙 | 사람이 같이 다듬는 해석·절차 지식 |

> 미수금 잔액·일정·금액 등 거래 수치는 **절대 위키에 넣지 않음**. 위키는 노하우 전용.

## 9. 보안

- ERP MCP/API: Bearer 토큰 인증, Supabase `service_role_key`는 서버측에만.
- Slack: DM pairing/allowlist로 6명만.
- Obsidian 볼트: **private git repo + 접근통제.** 고객 개인정보(이름·연락처·주소)는 위키 반입 최소화/선별 — 민감정보는 DB에만 둘지 검토.
- 시청 제출 공문 **자동제출 금지**, 사람 승인 필수(문지기 역할).
- 쓰기성 도구는 Slack 확인카드 승인 후 실행.

## 10. 인원 배치 (6명) — 초안, 확인 필요

- **대표(김재호, 관리자)**: 전체 권한. 주간(월)·월간(1일) 보고, 긴급 알림, 지출감시, 협력업체 평가. 회사규칙(위키 `SCHEMA`/규칙) 최종 큐레이션.
- **직원 5명**: 각자 Slack DM. 본인 KPI만, 일지 코칭, 마감 리마인드. Hermes가 개인별 모델링.
- **위키 큐레이터**: 누가 Obsidian 위키를 주로 돌볼지 지정 필요(대표 또는 지정 직원). → **확인 필요**
- 권한 매핑: Slack 사용자 ID ↔ `staff` 테이블 role(관리자/직원) ↔ AI_RULES.md의 대표/직원 규칙.

## 11. 이행(대체) 계획 — 무중단 단계

- **P0** 준비: 미커밋 브랜치(`feat/register-enhancement`, `claude/*`) 정리.
- **P1** Hermes 기동: VPS·도커 설치, Slack 연결, Claude 모델, Obsidian 볼트(git) 연결. (ERP 접근 전, Slack 대화만)
- **P2** 읽기 도구: ERP MCP 서버 구축 → 조회 도구부터(`search_projects`, `get_dashboard_stats`). 기존 인앱 AI와 **병행 운영**.
- **P3** 쓰기 도구: `register_project`/`update_status`/`record_deposit`/`manage_schedule` 이전. 입금 파이프라인은 `HANDOFF_DEPOSIT_PIPELINE.md` 테스트 케이스로 검증.
- **P4** 스케줄: 보고 4종·문지기 알림을 Hermes cron으로 이전.
- **P5** 자가학습: llm-wiki 셋업(`SCHEMA.md` 회사 도메인), 학습 루프·lint 가동.
- **P6** 제거: 검증 완료 후 인앱 AI 비서·텔레그램 봇 **제거**. ERP는 화면 + MCP/API + 데이터만.

## 12. 하지 않는 것 (범위 경계)

- ERP 화면·Supabase 데이터 모델 갈아엎기 (유지).
- 개인 카카오톡 직접 연동 (불가 — Slack 전달 방식).
- 시청 공문 자동 제출 (작성까지만).
- 거래 데이터를 Obsidian에 저장 (금지).
- 멀티 에이전트 과설계 (단일 에이전트 + 도구, 기존 AGENT.md 방침 유지).

## 13. 미결/확인 필요

1. 카톡 고객정보 전달은 **텍스트/스크린샷 중 주로 무엇**인지(Vision 비중).
2. 공문 양식 파일 형식: **PDF / 한글(HWP)** — HWP면 변환·생성 도구 선택 영향.
3. 공문 **제출처**(시청 포털 업로드 vs 출력·방문) — 자동화 경계.
4. 생성 공문 저장: **구글드라이브** 확정?(원래 계획) Storage 병행?
5. **VPS 제공사**(예: Vultr/Hetzner/AWS Lightsail 등) 및 운영 담당.
6. 모델: Claude 유지 vs Nous Portal 등 비용·품질 비교 필요 여부.
7. **위키 큐레이터** 지정.
8. Slack 워크스페이스: 신규 개설인지, 기존 보유인지.

## 14. 리스크

- 거대 단일 `projects` 테이블(80여 컬럼)에 신규 도구 추가 시 `validate.ts` 스키마 동기화 누락 주의.
- 위키에 잘못된 학습이 "사실"로 굳을 위험 → confidence/contested 플래그 + 정기 lint + 사람 리뷰.
- 개인정보의 위키 반입 → 보안/규정 리스크.
- VPS 단일 장애점 → 백업·재기동 절차 필요.

## 15. 다음 단계

설계 승인 후 **writing-plans 스킬**로 단계별 구현 계획(P1~P6)을 작성한다.
