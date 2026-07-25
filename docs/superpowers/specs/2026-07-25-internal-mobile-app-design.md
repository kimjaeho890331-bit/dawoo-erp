# 사내 전용 모바일 앱(PWA) — 설계

날짜: 2026-07-25 / 승인: 김태정 대리
결정 사항: 스토어 등록 안 함 · 전원 안드로이드 · 온라인 전용(오프라인 미지원) · 설치는 크롬 설치 버튼 방식 · 주소는 현행 `dawoo-erp-web.vercel.app` 유지 · 앱 푸시 추가(텔레그램 병행)

## 문제

직원 전원이 안드로이드 폰을 쓰는데 ERP를 브라우저로만 열 수 있다. 두 가지가 걸린다.

1. **앱이 아니다.** 주소창·탭이 화면 위쪽을 먹고, 홈 화면 아이콘이 없어 매번 브라우저에서 주소를 찾아 들어가야 한다.
2. **절반이 폰에서 못 쓴다.** 대시보드·접수대장·업무캘린더만 폰 화면이 있고, 현장관리·지출결의서·A/S관리·거래처DB·연차신청·서류함은 PC 폭을 전제로 짜여 있어 좌우로 밀어야 읽힌다.

동시에 "ERP를 고치면 앱에도 자동 반영"이 요구사항이다.

## 접근 방식과 근거

### 왜 APK를 직접 배포하지 않는가

안드로이드 크롬은 사용자가 설치를 누르면 구글 서버가 APK를 생성·서명해 조용히 설치한다(WebAPK). 앱 서랍·설정 앱 목록·앱 전환기에 모두 잡히며, 실행 후 동작은 직접 만든 TWA APK와 같다.

직접 빌드(TWA)는 서명 키 관리, Digital Asset Links 검증 파일, 그리고 **껍데기 수정 시 전 직원 수동 재설치**가 따라온다. WebAPK는 크롬이 알아서 최신을 유지한다. 얻는 결과가 같고 관리 비용만 다르므로 WebAPK를 택한다.

화면·기능은 어느 쪽이든 서버에서 내려받으므로, `main` 푸시 → Vercel 배포가 그대로 앱 업데이트가 된다. 요구사항은 이 구조에서 자동 충족된다.

### 왜 Serwist를 쓰지 않는가

오프라인 미지원으로 확정됐다. 오프라인 캐싱 라이브러리(Serwist)는 webpack 설정을 요구하는데 이 프로젝트는 Next 16 + Turbopack이다. 캐싱을 안 하면 푸시 수신만 담당하는 손으로 쓴 `public/sw.js` 하나로 충분하고, 번들러 충돌 자체가 발생하지 않는다.

### 왜 `beforeinstallprompt`를 쓰는가

Next.js 공식 문서는 이 API가 사파리에서 동작하지 않아 권장하지 않는다. 전원 안드로이드 크롬이므로 해당 제약이 없고, 앱 안에 우리가 디자인한 설치 배너를 띄울 수 있어 안내가 확실하다.

---

## 1단계 — 앱 껍데기

### 1-1. 매니페스트 (`src/app/manifest.ts`, 신규)

Next.js App Router 파일 컨벤션. `MetadataRoute.Manifest` 반환.

| 필드 | 값 | 근거 |
|---|---|---|
| `name` | `다우 ERP` | |
| `short_name` | `다우ERP` | 홈 화면 라벨(12자 이내) |
| `start_url` | `/dashboard` | 앱 실행 시 로그인 경유해 대시보드 진입 |
| `display` | `standalone` | 주소창 제거 |
| `theme_color` | `#c96442` | `--color-accent` (globals.css) |
| `background_color` | `#f5f4ed` | `--color-page` |
| `lang` / `dir` | `ko` / `ltr` | |
| `icons` | 192·512 + maskable 512 | 아래 |

다크모드 정의가 코드에 없으므로 라이트 단일 테마로 고정한다.

### 1-2. 아이콘 (`public/`, 신규)

로고 이미지 파일이 없다. Sidebar.tsx L108~122의 렌더링(터라코타 `#c96442` 둥근 사각형 + 흰색 `D`)을 그대로 래스터화한다. Python PIL로 생성(스크립트는 `scripts/gen-icons.py`로 남겨 재생성 가능하게 한다).

- `icon-192.png`, `icon-512.png` — `purpose: any`. 모서리 반경 = 변의 22%.
- `icon-maskable-512.png` — `purpose: maskable`. 안드로이드가 원형·스퀘어클 등으로 잘라내므로 안전 영역(중앙 80%) 안에 `D`를 두고 배경을 가장자리까지 꽉 채운다.
- `apple-touch-icon.png` (180) — 전원 안드로이드지만 비용이 0이고 향후 아이폰 유입 대비.

`src/app/favicon.ico`는 그대로 둔다.

### 1-3. 메타데이터 (`src/app/layout.tsx`, 수정)

`export const viewport: Viewport` 신규 — `themeColor: '#c96442'`, `viewportFit: 'cover'`, `initialScale: 1`, `maximumScale: 5`(확대 허용, 접근성).
`metadata`에 `manifest: '/manifest.webmanifest'`, `appleWebApp: { capable: true, statusBarStyle: 'default', title: '다우ERP' }` 추가.

### 1-4. 서비스워커 (`public/sw.js`, 신규)

- `install` → 오프라인 안내 페이지 1개만 캐시에 넣고 `self.skipWaiting()`
- `activate` → 구버전 캐시 정리 후 `self.clients.claim()`
- `fetch` → **화면 이동 요청만** 가로채 네트워크 우선, 실패 시 안내 페이지
- `push` → `event.data.json()`을 읽어 `showNotification`
- `notificationclick` → 알림 payload의 `data.url`로 이동. **이미 열린 앱 창이 있으면 그 창을 focus 후 navigate**하고, 없을 때만 `openWindow`. (매번 새 창을 열면 앱 창이 쌓인다.)

**`fetch` 핸들러는 선택이 아니다.** 크롬은 fetch 핸들러가 없으면 `beforeinstallprompt`를 쏘지 않아 설치 배너가 아예 뜨지 않는다. 메뉴를 통한 수동 설치는 Chrome 108(모바일)부터 이 요구가 없어졌지만, **프롬프트 표시 알고리즘은 여전히 요구한다.** 게다가 크롬은 조건만 채우려고 넣은 빈 핸들러를 무시하므로 실제로 동작하는 코드여야 한다.

그래서 최소한의 실제 동작으로 화면 이동만 처리한다. 정적 자원·API 요청에는 `respondWith`를 부르지 않아 브라우저 기본 동작이 유지되고, 서비스워커를 거치는 지연도 생기지 않는다. 캐시에 넣는 것은 `public/offline.html` 한 개뿐이며 콘텐츠는 캐싱하지 않는다 — 오프라인 지원이 아니라 연결 끊김 안내다.

`/offline.html`도 미들웨어 인증에서 빼야 한다(워커가 로그인 전에도 캐시에 담는다).

### 1-5. 설치 배너 (`src/components/pwa/`, 신규)

- `ServiceWorkerRegistrar.tsx` — 클라이언트 컴포넌트. 마운트 시 `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`. 렌더 출력 없음. `ClientLayout`에 삽입.
- `InstallBanner.tsx` — `beforeinstallprompt`를 `preventDefault()`로 잡아 보관 → 자체 배너 노출 → 클릭 시 `prompt()`. 다음 경우 렌더하지 않는다:
  - `window.matchMedia('(display-mode: standalone)').matches` (이미 설치됨)
  - 사용자가 닫음 (`localStorage: dawoo_install_dismissed`)
  - 이벤트가 오지 않음 (설치 불가 환경)
  - 화면 폭 `md` 이상 (PC에서는 불필요)

배치는 `ClientLayout`의 모바일 상단바 바로 아래. 로그인 화면에는 띄우지 않는다(설치는 로그인 후).

### 1-6. 미들웨어 예외 (`src/middleware.ts`, 수정)

matcher가 `'/((?!_next/static|_next/image|favicon.ico).*)'` 라서 `/manifest.webmanifest`·`/sw.js`·`/icon-*.png`가 전부 인증 검사를 탄다. 로그인한 사용자는 쿠키가 함께 나가 통과하지만, **크롬은 로그인 전에도 매니페스트와 아이콘을 읽어 설치 가능 여부를 판정한다.** 리다이렉트가 걸리면 설치 배너가 아예 뜨지 않는다.

L27~30의 통과 조건에 `/manifest.webmanifest`, `/sw.js`, `/apple-touch-icon.png`, `/icon-` 접두사를 추가한다. 이 파일들에는 민감 정보가 없다.

### 1-7. 헤더 (`next.config.ts`, 수정)

기존 CSP는 `worker-src` 디렉티브가 없어 `script-src 'self'`로 폴백되므로 `/sw.js` 등록이 현재도 통과한다. 다만 의도를 고정하기 위해 `worker-src 'self'`를 명시한다.
`/sw.js` 전용 헤더 추가 — `Cache-Control: no-cache, no-store, must-revalidate`. 워커가 캐시되면 갱신이 늦는다.

### 1-8. 1단계 완료 기준

폰 크롬으로 접속 → 배너의 설치 → 홈 화면/앱 서랍에 아이콘 → 실행 시 주소창 없이 대시보드. 대시보드·접수대장·업무캘린더가 앱 안에서 정상 동작.

---

## 2단계 — 페이지별 폰 화면

### 2-0. 공통 선결 (페이지 작업 전에 먼저)

1. **이중 패딩 제거.** `ClientLayout` L37이 이미 `px-4 py-4`를 준다. 루트에 `p-6`을 중복으로 거는 5개 파일을 `p-0 md:p-6`으로 바꾼다 — `SitesPage` L128, `ExpensesPage` L257, `AsPage` L203, `VendorsPage` L315, `LeavePage` L299. (`DocumentsPage` L1764는 이미 패딩 없음.)
2. **모달 고정폭 2곳.** 공용 `.modal-container`(globals.css L369)는 `max-width:28rem; margin:0 16px`로 반응형인데, Tailwind 고정폭이 이를 덮어쓴다. `SitesPage` L240 `w-[560px]` → `w-full md:w-[560px]`, `ProcessCalendar` L562 `w-[460px]` → `w-full max-w-[460px] mx-4`.
3. **AsPage 모달 여백.** L371 `max-w-lg`에 `mx-4` 추가. 좌우 여백 없이 화면 가장자리에 붙는다.
4. **`MobileAccordion` 공용화.** `DashboardPage` L375~412에 있는 것을 `src/components/ui/MobileAccordion.tsx`로 옮기고 `DashboardPage`는 import로 교체. 시그니처(`title, icon, badge?, open, onToggle, accentColor, children`) 유지.

### 2-1. 적용 패턴

기존 코드에 이미 있는 두 패턴만 쓴다. 새 패턴을 만들지 않는다.

- **패턴 A — 테이블 → 카드** (`RegisterPage` L608·L651). 리스트 영역만 이중 렌더: `md:hidden` 카드 리스트 + `hidden md:block` 테이블. 카드는 전체 컬럼 중 **5~6개만 골라 3줄**로 압축(1행 제목+상태 배지, 2행 보조정보, 3행 담당자·분류칩).
- **패턴 B — 아코디언** (`MobileAccordion`). 정보 덩어리가 많아 한 화면에 안 들어가는 상세 화면.

PC 화면은 건드리지 않는다. `md` 이상에서 렌더 결과가 지금과 같아야 한다.

### 2-2. 페이지별 작업 (쉬운 순서)

| # | 페이지 | 난이도 | 핵심 작업 |
|---|---|---|---|
| 1 | 서류함 `DocumentsPage` | 낮음 | 테이블 없음, 모달 전부 `mx-4`로 안전. `grid grid-cols-3` L934, `grid-cols-2` L1199, `grid-cols-3` L1224만 분기 추가. 브레이크포인트가 `sm`/`lg`로 다른 파일과 다른데 그대로 둔다(동작에 문제 없음). |
| 2 | 거래처DB `VendorsPage` | 낮음 | `hidden md:block`/`lg`/`xl` 점진 숨김이 이미 있음(L427·431·449). `md` 미만 전용 카드 뷰 추가 — 이름·연락처·공종칩 3줄. 칩 입력창 `w-[120px]` L368 폭 조정. |
| 3 | 연차신청 `LeavePage` | 중간 | 규정 안내 L338~347 `flex`에 `flex-wrap` (현재 좌우 스크롤 확정). 신청 리스트 행 L397~442를 패턴 A로 카드화. 관리 드롭다운 L432 `absolute right-0 w-28`이 화면 밖으로 나가지 않게 조정. |
| 4 | 지출결의서 `ExpensesPage` | 높음 | 테이블 3개 카드화 — L316(7컬럼, **`overflow-x-auto`조차 없어 body 전체가 좌우 스크롤**), L718(5컬럼), L863(6컬럼). `grid-cols-3` L287, `grid-cols-2` L650·L750, `grid-cols-3` L778 분기. 3탭 세그먼트가 헤더 한 줄에 들어가 폭 압박 → 탭을 별도 줄로. 고정지출 탭 L352는 이미 flex 리스트라 손댈 것 적음. |
| 5 | A/S관리 `AsPage` | 높음 | **10컬럼 테이블** L293~306 카드화(현장명·접수일·하자유형·담당자·상태만 노출). `max-w-[200px] truncate` 셀 2개(L322·323) 제거. 요약 `grid-cols-4` L252 → `grid-cols-2 md:grid-cols-4`. 탭이 3층(L216·232·267)이라 세로 잠식 → 폰에서는 상위 2층을 한 줄 세그먼트로 합친다. |
| 6 | 현장관리 `SitesPage` | 높음 | 아코디언 행 고정폭(L152~159 헤더, L308~328 본문: `w-20`+`w-20`+`w-24`+`w-28` ≈ 440px)을 폰에서 2줄 카드로. 현장일지 8컬럼 테이블 L693~704 패턴 A 적용. `SiteLogForm` L801~987은 인라인 카드인데 폰에서는 전체화면 시트로. 기본정보 `grid-cols-3`·`grid-cols-2`(L536·560·576·586·596), 서류탭 `grid-cols-3` L1065 분기. 중첩 패딩(아코디언 → `SiteDetail` L363 `p-5` → 탭 L390 `p-4`)을 폰에서 축소. |
| 7 | 공정 캘린더 `ProcessCalendar` | 최상 | 아래 별도 항목 |
| 8 | 업무캘린더 `WorkCalendarPage` | 점검 | 폰 전용 뷰(`MobileCalendarView` L665~924)가 이미 있다. 실기기 점검 후 보완만. |

### 2-3. 공정 캘린더 — 모바일 재설계

`ProcessCalendar`는 HTML5 드래그앤드롭이 조작의 전부다(L341 `draggable`, L386~391 `onDragOver/onDrop`, L385·414 바 끝 스트레치). **HTML5 DnD는 터치에서 동작하지 않으므로 개조가 아니라 재설계다.**

폰 전용 뷰를 별도로 만든다:
- 좌측 `w-40` 공종 패널(L312)을 상단 가로 스크롤 칩 줄로 이동. 160px 고정 패널이 375px 화면에서 캘린더를 27px/일까지 압축한다.
- 조작은 **공종 칩 선택 → 시작일 탭 → 종료일 탭** 2탭 방식으로 대체.
- 기존 일정 수정은 바를 탭 → 모달에서 날짜 입력.
- 월 헤더 L304 `min-w-[140px]` + 좌우 버튼 + 안내문구가 한 줄 `justify-between`이라 넘침 → 안내문구를 폰에서 숨김.
- 이 파일만 디자인 토큰이 아니라 raw Tailwind(`bg-white`, `text-gray-900`)를 쓴다. 모바일 뷰 신규 코드는 토큰을 쓰되, 기존 PC 코드의 색상 정리는 **이번 범위에 넣지 않는다**(무관한 리팩터링).

---

## 3단계 — 앱 푸시

### 3-1. 발송 경로 통합 (선결)

`sendMessage` 호출이 4곳에 복붙돼 있다 — `cron/morning` L63, `cron/afternoon` L56, `cron/evening` L55, `cron/imminent` L72. 여기에 푸시를 각각 끼우면 중복이 8곳이 된다.

`src/lib/notifications/dispatch.ts` (신규)로 fan-out을 모은다:

```
dispatchNotification(staff, message, { trigger, referenceDate, url? })
  → 텔레그램 발송 (staff.telegram_chat_id && staff.notify_telegram)
  → 웹푸시 발송 (staff.notify_push && 활성 구독 존재)
  → 두 채널 병렬(Promise.allSettled), 한쪽 실패가 다른 쪽을 막지 않음
  → notifications_log에 채널별로 기록
```

4개 라우트의 `sendMessage` 호출부를 이것으로 교체한다.

### 3-2. 대상 조회 조건 완화

현재 `cron/morning` L37 등이 `.not('telegram_chat_id','is',null)`로 거른다. **텔레그램 미연동 + 앱만 설치한 직원이 후보에서 통째로 빠진다.** 텔레그램 연동자 또는 푸시 구독자를 모두 포함하도록 조건을 바꾼다.

### 3-3. 메시지 변환

`digest.ts`가 만드는 문자열은 텔레그램 Markdown(`*볼드*` + 이모지)이고 여러 줄이다. 푸시 알림 body로는 부적합하다.

`toPushPayload(message)` — `*` 등 Markdown 마크 제거, 첫 줄을 `title`로, 나머지를 공백 정규화해 `body` 120자 축약. `bot.ts` L151~154에 `escapeMarkdown`은 있으나 stripping 함수는 없으므로 신규 작성.

### 3-4. DB (`supabase/migrations/012_push_subscriptions.sql`, 신규)

파일 번호는 011 다음인 **012**. 기존 관례(맨 위 주석 3~4줄, `-- 적용` 섹션, `IF NOT EXISTS`, `COMMENT ON TABLE`, 맨 아래 롤백 주석)를 따른다.

```
push_subscriptions
  id UUID PK, staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  user_agent TEXT, created_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ
  INDEX (staff_id)
staff.notify_push BOOLEAN DEFAULT true   -- notify_telegram과 대칭
```

한 직원이 여러 기기를 쓸 수 있으므로 1:N이다.

**RLS는 켠다.** 이 프로젝트의 다른 테이블은 RLS를 끄는 게 현행 관례지만(`009_vendor_categories_rls_off.sql` 참고 — 프론트가 anon 클라이언트라 켜면 화면이 막힌다), 이 테이블은 푸시 발송 키를 담는다. **읽기·쓰기를 전부 API Route(`service_role`)로만 하면 RLS를 켜도 화면이 막히지 않는다.** 정책을 만들지 않아 anon·authenticated는 접근할 수 없고 `service_role`만 통과한다. `notifications_log`의 `FOR ALL USING (true)` 패턴은 사실상 무방비이므로 따르지 않는다.

`notifications_log`의 중복 방지 유니크 인덱스 `uniq_notif_daily(staff_id, trigger, reference_date)`에 **`channel`이 빠져 있다.** 텔레그램과 푸시를 각각 기록하면 충돌한다. 인덱스를 `(staff_id, trigger, reference_date, channel)`로 재생성한다.

### 3-5. 발송 (`src/lib/notifications/push.ts`, 신규)

`web-push` 패키지 추가. VAPID 키는 `web-push generate-vapid-keys`로 생성해 Vercel 환경변수에 등록 — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

`sendWebPush(staffId, payload)` — 해당 직원의 활성 구독 전체에 병렬 발송. **410 Gone / 404를 받으면 해당 구독 행을 삭제한다**(앱 삭제·구독 만료). 이 정리를 안 하면 죽은 구독이 쌓여 매번 실패한다.

### 3-6. 구독 (프론트 + API)

- `src/components/pwa/PushSubscribe.tsx` — 설정 페이지에 배치. 권한 요청은 **페이지 로드 시가 아니라 사용자가 "알림 받기"를 켤 때** 한다(즉시 요청하면 거부율이 높다). `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → 결과를 API로 전송.
- `src/app/api/push/subscribe/route.ts`, `unsubscribe/route.ts` — `service_role`로 `push_subscriptions` upsert/삭제.
- 설정 화면에 텔레그램·앱 푸시 토글 2개.

### 3-7. 중복 발송 정책

텔레그램과 앱 푸시를 **둘 다 켠 직원은 같은 내용을 두 번 받는다.** 알림을 놓치는 쪽보다 낫다고 판단해 이렇게 간다. 각자 설정에서 한쪽을 끌 수 있다. 나중에 "푸시 구독이 있으면 텔레그램 생략"으로 바꾸려면 `dispatch.ts` 한 곳만 고치면 된다.

---

## 하지 않는 것

- **APK 직접 빌드·배포** (TWA, Bubblewrap, PWABuilder). WebAPK가 같은 결과를 준다.
- **스토어 등록** (Play Store, App Store).
- **오프라인 지원**. 캐싱 전략·Serwist·백그라운드 동기화 전부 제외. (연결 끊김 안내 페이지 1개만 캐시하는데, 이건 설치 프롬프트 조건을 채우기 위한 최소 fetch 핸들러의 부산물이지 오프라인 기능이 아니다.)
- **아이폰 대응**. 전원 안드로이드. `apple-touch-icon`과 `appleWebApp` 메타만 비용 0이라 넣어둔다.
- **커스텀 도메인 연결**. 현행 `dawoo-erp-web.vercel.app` 유지. (설치는 origin에 묶이므로, 나중에 도메인을 바꾸면 전 직원 재설치가 필요하다는 점은 인지된 상태.)
- **PC 화면 변경**. `md` 이상 렌더 결과가 지금과 같아야 한다.
- **보고서·KPI·회계달력·설정의 폰 대응**. 사무실 전용으로 분류.
- **텔레그램 알림 제거**. 병행 유지.
- **`ProcessCalendar`의 raw Tailwind 색상 정리**. 무관한 리팩터링.
- **다른 테이블의 RLS 정비**. `push_subscriptions`만 예외적으로 켠다.

## 검증

각 단계는 독립 배포 가능하다. 단계마다 아래를 통과해야 한다.

**공통**: `npx tsc --noEmit` 통과, `npm run build` 통과, 변경 파일 `npx eslint` 신규 오류 0건(기존 경고는 무관).

**1단계**: 로컬 프리뷰에서 `/manifest.webmanifest` 200 응답 + 필드 검증, `navigator.serviceWorker.controller`가 null이 아님, `display-mode: standalone` 매칭 확인. 배포 후 실기기(안드로이드 크롬)에서 설치 → 앱 서랍 아이콘 → 주소창 없이 실행까지 직접 확인.

**2단계**: 페이지마다 375px 뷰포트에서 **`document.documentElement.scrollWidth <= clientWidth`** (좌우 스크롤 없음)를 자동 확인. `md` 이상에서 스냅샷이 변경 전과 동일한지 확인. 모달은 열어서 화면 밖으로 나가지 않는지 확인.

**3단계**: 로컬은 `next dev --experimental-https`가 필요하다(푸시는 HTTPS 전용). 실기기에서 구독 → 테스트 발송 수신 → 알림 탭 시 해당 화면으로 이동 확인. 구독 삭제 후 발송 시 410 처리로 행이 정리되는지 확인. cron 라우트는 `CRON_SECRET` 헤더로 수동 호출해 텔레그램·푸시 양쪽 발송과 `notifications_log` 채널별 기록을 확인.
