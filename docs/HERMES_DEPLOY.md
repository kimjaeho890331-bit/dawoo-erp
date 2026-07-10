# HERMES_DEPLOY — 헤르메스 에이전트 ↔ ERP 연동 배포 진행상황

> **작성일 2026-07-09.** 다음 세션에서 이 문서를 먼저 읽고 "▶ 재개 지점"부터 바로 이어가면 된다.
> 관련 설계: `docs/AGENT.md`(에이전트 도구), `docs/superpowers/`(Hermes ERP automation design, commit cff304c).

---

## 🎯 목표
직원 6명(대표 김재호 + 직원 5)이 **Slack**으로 헤르메스에게 지시 → 헤르메스가 **ERP(Supabase) 데이터를 조회/업무 수행**. Hostinger **VPS에서 24시간** 구동.

## 🗺️ 전체 구조
```
직원(6명) ──DM/@멘션──▶ Slack (Socket Mode, 포트개방 불필요)
                          │
                          ▼
        Hostinger KVM 2 VPS 의 헤르메스 Docker 컨테이너 (Ubuntu 24.04)
                          │  hermes mcp add 로 등록한 MCP
                          ▼
        Supabase Postgres (project-ref: etwpcaedbuubjzbfrjli, 서울) = ERP DB
                          ▲
        다우 ERP(Next.js @ Vercel) ── 그대로 유지, VPS로 옮기지 않음
```
**핵심:** ERP는 Vercel/Supabase에 그대로 두고, **VPS엔 헤르메스만** 올린다. 헤르메스는 네트워크(MCP)로 ERP DB에 접근한다.

---

## ✅ 확정된 결정
| 항목 | 결정 |
|------|------|
| 연동 방향 | **방향 A** — 헤르메스가 ERP를 운영 (ERP 웹 비서 교체 아님) |
| 서버 | **Hostinger KVM 2 VPS** (2 vCPU / 8GB / 100GB NVMe) |
| OS/런타임 | **Ubuntu 24.04 + Docker** (Hostinger 카탈로그 템플릿) |
| 배포방식 | Hostinger VPS **Docker 애플리케이션 카탈로그의 "Hermes Agent" 원클릭** (수동 SSH 설치 아님) |
| 24h 유지 | Docker 컨테이너 자동 재시작 (systemd 불필요) |
| 공유 창구 | **Slack** (무료 플랜 가능, 인원 무제한, 90일 히스토리 제한만 있음) |
| Slack 연결 | **Socket Mode** — 토큰 2개(bot `xoxb-` + app-level `xapp-`), 공개 URL/인바운드 포트 불필요 |
| 모델 | Quick Setup(**nexos.ai** 번들 크레딧) 또는 본인 **ANTHROPIC_API_KEY** (ERP와 통일 원하면 후자) |
| 에이전트 선택 | **Hermes** (OpenClaw 아님 — Hermes가 후속·상위, 자기개선 스킬 루프) |

---

## 📋 진행 체크리스트
**Phase 0 — 인프라 (완료)**
- [x] Hostinger 계정
- [x] KVM 2 VPS 구매
- [x] 중복결제(KVM 2 1건) + 미사용 Business 웹호스팅 **환불 요청 완료** → KVM 2 **1개만 유지**

**Phase 1 — 헤르메스 배포 (거의 완료) ◀ 현재**
- [x] VPS 프로비저닝: **자카르타(인도네시아)**, 서버 `srv1816319.hstgr.cloud`, Ubuntu 24.04 + Docker
- [x] Hermes Agent 템플릿 배포 (관리자 ID: `hermes` / PW는 대표가 별도 저장)
- [x] Docker 컨테이너 2개 실행중: `hermes-agent-7emm`(본체) + `traefik`(프록시) — **2개가 정상**
- [x] 터미널 진입: hPanel → 도커 매니저 → hermes-agent 옆 **터미널/Open** → 컨테이너 `hermes-agent-7emm-hermes-agent-1`, 프롬프트 `root@...:/opt/hermes#`
- [x] `hermes doctor` 통과 (Node/Playwright/도구 정상) + `hermes doctor --fix`
- [x] `hermes setup` — Full setup, Terminal Backend = **local 유지**
- [x] Provider **Anthropic** 연결 + 모델 **claude-sonnet-4-6** 설정 (`✓ API key saved`)
- [x] TUI 부팅 확인: Hermes Agent v0.18.2 · 28 tools · 68 skills
- [ ] **⚠️ 마지막 남은 것: API 키 교체** — 첫 키(hermes-vps용 신규발급)가 **크레딧 없는 다른 계정** 소속이라 HTTP 400 "credit balance too low". **기존 ERP 키(작동 검증됨)로 재입력** 필요 → 아래 재개 지점 참조
- [ ] `hermes` 대화 테스트 (`안녕` → 응답 확인)

**Phase 2 — Slack 연결 (예정)**
- [ ] `hermes slack manifest --write` → 앱 생성 → `xapp-`/`xoxb-` 토큰
- [ ] 직원 6명 Slack **멤버 ID** 수집 → `SLACK_ALLOWED_USERS`
- [ ] `hermes gateway run` + 채널에 `/invite @Hermes Agent`

**Phase 3 — ERP 연결 (예정)**
- [ ] 3a. Supabase MCP **read-only** 조회 (명령 1줄) ← 쉬움, 먼저
- [ ] 3b. 접수 등록·단계변경 등 **쓰기 액션** = ERP에 얇은 MCP 래퍼 개발 필요 (개발 과제)

**Phase 4 — 보안/직원 규칙 (예정)**
- [ ] 직원 터미널/코드실행 차단, 직원별 독립 세션, 관리자 명령 분리, 위험작업 승인

---

## ▶ 재개 지점 (다음 세션에서 여기부터)
**현재 위치: Phase 1 마지막 단계 — API 키를 "기존 ERP 키"로 교체 후 대화 테스트.**

터미널 진입: hPanel → VPS(`srv1816319`) → **도커 매니저** → hermes-agent 옆 **터미널** 클릭.

1. (Claude 세션에서) **"기존 ERP 키 클립보드에 복사해줘"** 요청 → `.env.local`의 `ANTHROPIC_API_KEY`를 clip.exe로 복사해줌
2. VPS 터미널: `hermes model` → `6`(Anthropic) → `2`(API key) → **키 붙여넣기**(우클릭) → Enter → 모델 목록에서 ↓4번 `claude-sonnet-4-6` → Enter
3. `hermes` 실행 → `안녕! 넌 누구야?` → **응답 오면 Phase 1 완료** → `/quit`으로 나가기
4. 이어서 Phase 2: `hermes slack manifest --write`

### ⚠️ 마법사 조작 요령 (시행착오에서 배운 것)
- **숫자를 물으면 숫자만, 키는 "API key:" 프롬프트에서만** 붙여넣기
- **Ctrl+C / ESC 누르면 마법사 통째로 종료됨** — 오타는 Backspace로만 수정
- 브라우저 터미널 붙여넣기 = **우클릭 → 붙여넣기** 또는 `Ctrl+Shift+V`
- 입력창에 `]11;rgb:0000/...` 같은 문자가 끼면 터미널 신호 노이즈 — Ctrl+U로 지우고 무시

### 컨테이너 내부 경로 (참고)
- 설정: `/opt/data/config.yaml` · 비밀키: `/opt/data/.env` · 설치: `/opt/hermes`

### 🔑 API 키 메모
- `dawoo-erp/.env.local`의 `ANTHROPIC_API_KEY` = **ERP가 쓰는 키, 크레딧 있음(curl 검증 완료)** ← 당분간 헤르메스도 이 키 사용
- `HERMES_ANTHROPIC_API_KEY`(같은 파일) = hermes-vps용으로 신규 발급했으나 **크레딧 없는 다른 계정** 소속이라 미사용
- **나중에 정리**: ERP 키의 계정(console.anthropic.com)에서 `hermes-vps` 키 재발급 → 헤르메스 키 교체 (계정 분리 관리 목적)

---

## 🧩 배포 후 실행 명령 (VPS 터미널)

### Phase 2 · Slack
```bash
hermes slack manifest --write        # ~/.hermes/slack-manifest.json 생성
```
1. https://api.slack.com/apps → **Create New App → From an app manifest** → 워크스페이스 선택 → JSON 붙여넣기
2. **Socket Mode** 켜기 → Basic Information → App-Level Tokens → 스코프 `connections:write` → **`xapp-…`** 복사
3. **Install to Workspace** → **`xoxb-…`** (Bot 토큰) 복사
4. 직원 6명 멤버 ID 수집 (프로필 → ⋮ → Copy member ID, `U0…` 형태)
```bash
hermes gateway setup                 # Slack 선택, 토큰 입력 (또는 ~/.hermes/.env 직접)
#   SLACK_BOT_TOKEN=xoxb-...
#   SLACK_APP_TOKEN=xapp-...
#   SLACK_ALLOWED_USERS=U..,U..,U..   # 6명 전부 — ⚠️ 없으면 전원 차단(fail-closed)
hermes gateway run                    # 컨테이너 배포 시 자동 실행되기도 함
```
Slack 채널에서 `/invite @Hermes Agent` → 직원은 @멘션 또는 DM으로 사용.

### 모델 (본인 Anthropic 키 사용 시)
```bash
hermes config set ANTHROPIC_API_KEY sk-ant-...
```

### Phase 3a · ERP Supabase MCP (읽기전용, 1줄)
```bash
hermes mcp add supabase --command npx --env SUPABASE_ACCESS_TOKEN=sbp_토큰 \
  --args -y @supabase/mcp-server-supabase@latest --read-only --project-ref=etwpcaedbuubjzbfrjli
hermes mcp test supabase
hermes mcp list
```
- `--args`는 반드시 **맨 마지막** (뒤 플래그를 통째로 삼킴). `--env`·`--command`는 그 앞에.
- `sbp_토큰` = Supabase **Personal Access Token** (supabase.com → Account → Access Tokens에서 발급). anon/service_role 키 아님.
- 이 시점에 "이번 달 접수 몇 건?", "미수금 현장?" 등 **읽기 조회** 가능.

### Phase 4 · 보안 (`~/.hermes/config.yaml`)
- `platform_toolsets.slack` → 직원에게 터미널/코드실행 툴 제외
- `group_sessions_per_user: true` → 직원별 독립 세션
- `slack.unauthorized_dm_behavior: pair` → 미승인 DM은 페어링 코드 (`hermes pairing approve slack <code>`)
- 위험명령 승인 = Slack 버튼 또는 스레드에 `!approve` / `!deny`

---

## 🧰 필요한 준비물
- [ ] 회사용 **Slack 워크스페이스** (없으면 무료 생성)
- [ ] 직원 6명 **Slack 멤버 ID**
- [ ] **Supabase Personal Access Token** (`sbp_…`)
- [ ] (선택) **ANTHROPIC_API_KEY** — ERP `.env.local`에 이미 존재

## 💰 예상 비용 (월)
| 항목 | 금액 |
|------|------|
| KVM 2 VPS | ~13,619원 (약정가) / 갱신 23,219원 |
| LLM API | ~$10 (본인 Anthropic 키) 또는 nexos.ai 크레딧 |
| **all-in** | **≈ $20–25/월** (GPU 불필요, 추론은 클라우드) |

## 💸 환불 진행
- KVM 2 **중복결제 1건** (H_46589615 / H_46589289 중 하나) — 환불 요청
- **Business Web Hosting** (H_46021559, 64,788원, 미사용) — 환불 요청
- 결과는 hPanel → 청구 → 결제 내역 → **환불 내역** 탭에서 확인

## 📎 참고
- Hermes 소스(로컬): `../hermes-agent/` (Nous Research, MIT, 2026-02)
- Hermes 공식 문서: https://hermes-agent.nousresearch.com/docs
- Hostinger Hermes 가이드: https://www.hostinger.com/support/how-to-get-started-with-hermes-agent-on-hostinger-vps
- 배경 조사: 워크플로우 2건(Hostinger VPS+Slack+ERP / Hostinger 네이티브 Hermes) — 핵심 결론은 본 문서에 반영됨
