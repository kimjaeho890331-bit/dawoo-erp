# 사내 전용 모바일 앱 — 1단계 앱 껍데기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원이 안드로이드 폰 크롬에서 링크를 열고 설치 버튼 한 번을 눌러, 주소창 없는 전체화면 앱으로 ERP를 쓸 수 있게 만든다.

**Architecture:** Next.js App Router의 `manifest.ts` 파일 컨벤션으로 웹앱 매니페스트를 내보내고, 캐싱 없이 푸시 수신만 담당하는 손으로 쓴 `public/sw.js`를 등록한다. 크롬의 `beforeinstallprompt` 이벤트를 가로채 앱 안에 자체 설치 배너를 띄운다. 오프라인을 지원하지 않으므로 Serwist 등 번들러 플러그인을 도입하지 않으며, 따라서 Turbopack과 충돌하지 않는다.

**Tech Stack:** Next.js 16.2.2 (App Router, Turbopack), React 19.2.4, TypeScript 5, Tailwind CSS v4, Python 3 + Pillow(아이콘 생성 스크립트)

**설계 문서:** `docs/superpowers/specs/2026-07-25-internal-mobile-app-design.md`

## Global Constraints

- 대상 기기는 **안드로이드 크롬 전용**이다. 아이폰/사파리 대응 코드를 추가하지 않는다(비용 0인 `apple-touch-icon`, `appleWebApp` 메타데이터는 예외로 넣는다).
- **오프라인 미지원.** 서비스워커에 캐싱·프리캐시·백그라운드 동기화를 넣지 않는다. `next-pwa`, `@ducanh2912/next-pwa`, `serwist`, `workbox` 패키지를 설치하지 않는다.
- **PC 화면(`md` 이상) 렌더 결과가 변경 전과 같아야 한다.** 설치 배너는 `md` 미만에서만 렌더한다.
- 브랜드 색상은 정확히 이 값을 쓴다: accent `#c96442`, 페이지 배경 `#f5f4ed`. (출처: `src/app/globals.css` `--color-accent`, `--color-page`)
- 앱 이름은 `다우 ERP`, 짧은 이름은 `다우ERP`.
- 시작 URL은 `/dashboard`.
- 색상은 하드코딩 대신 Tailwind 토큰 클래스(`bg-surface`, `text-txt-primary`, `border-border-primary`, `bg-accent` 등)를 쓴다. 매니페스트와 아이콘 생성 스크립트만 hex 리터럴을 쓴다.
- 아이콘은 Lucide React를 쓴다(`CLAUDE.md` 공통 UI 규칙). **이모지 금지.**
- 커밋 메시지 마지막 줄에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 를 넣는다.
- 이 프로젝트에는 테스트 러너가 없다. 검증은 `npx tsc --noEmit`, `npm run build`, `npx eslint <파일>`, 그리고 브라우저 실측(`mcp__Claude_Browser__*`)으로 한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `scripts/gen-icons.py` (신규) | 브랜드 아이콘 PNG를 생성한다. 로고 소스 파일이 없어 코드로 그린다. 재생성 가능하도록 저장소에 남긴다. |
| `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png` (신규, 생성물) | 매니페스트가 참조하는 아이콘. |
| `src/app/manifest.ts` (신규) | 웹앱 매니페스트. Next.js가 `/manifest.webmanifest`로 서빙한다. |
| `src/app/layout.tsx` (수정) | `viewport` export 추가, `metadata`에 `manifest`·`appleWebApp` 추가. |
| `public/sw.js` (신규) | 서비스워커. 설치·활성화·푸시 수신·알림 클릭만 처리. 캐싱 없음. |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` (신규) | 서비스워커 등록만 담당. 렌더 출력 없음. |
| `src/components/pwa/InstallBanner.tsx` (신규) | `beforeinstallprompt` 가로채기 + 설치 배너 UI. |
| `src/components/ClientLayout.tsx` (수정) | 위 두 컴포넌트 삽입. |
| `next.config.ts` (수정) | CSP에 `worker-src 'self'` 명시, `/sw.js` 캐시 금지 헤더. |

**의존 순서:** 아이콘 → 매니페스트 → layout 메타데이터 → sw.js → 등록/배너 컴포넌트 → ClientLayout 삽입 → next.config 헤더. 각 Task는 앞 Task의 산출물에만 의존한다.

---

### Task 1: 앱 아이콘 생성

로고 이미지 파일이 저장소에 없다. `src/components/Sidebar.tsx` L108~122가 로고를 CSS로 그린다 — 터라코타(`#c96442`) 둥근 사각형 안에 흰색 `D` 한 글자. 이것을 PNG로 래스터화한다.

**Files:**
- Create: `scripts/gen-icons.py`
- Create (생성물): `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`

**Interfaces:**
- Consumes: 없음
- Produces: 위 4개 PNG 경로. Task 2의 `manifest.ts`가 `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`를 참조하고, Task 3의 `layout.tsx`가 `/apple-touch-icon.png`를 참조한다.

- [ ] **Step 1: 아이콘 생성 스크립트를 작성한다**

`scripts/` 디렉터리가 없으면 만든다. 파일 `scripts/gen-icons.py`:

```python
"""앱 아이콘 생성 — Sidebar 로고(터라코타 라운드 사각형 + 흰색 D)를 PNG로 래스터화.

재생성: python scripts/gen-icons.py
Pillow 필요. 결과물은 public/ 아래에 쓴다.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ACCENT = "#c96442"
WHITE = "#ffffff"
OUT = Path(__file__).resolve().parent.parent / "public"

# 글자를 그릴 때 쓸 굵은 산세리프 후보. 없으면 기본 폰트로 떨어진다.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def draw_letter(img: Image.Image, box: int, glyph_ratio: float) -> None:
    """중앙에 흰색 D를 그린다. glyph_ratio는 캔버스 대비 글자 크기 비율."""
    draw = ImageDraw.Draw(img)
    font = load_font(int(box * glyph_ratio))
    left, top, right, bottom = draw.textbbox((0, 0), "D", font=font)
    draw.text(
        ((box - (right - left)) / 2 - left, (box - (bottom - top)) / 2 - top),
        "D",
        font=font,
        fill=WHITE,
    )


def rounded_icon(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """모서리가 둥근 아이콘. 바깥은 투명."""
    scale = 4  # 안티에일리어싱용 초과 샘플링
    box = size * scale
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        (0, 0, box - 1, box - 1), radius=int(box * radius_ratio), fill=ACCENT
    )
    draw_letter(img, box, 0.5)
    return img.resize((size, size), Image.LANCZOS)


def maskable_icon(size: int) -> Image.Image:
    """maskable용. 안드로이드가 원형/스퀘어클로 잘라내므로 배경을 가장자리까지
    꽉 채우고, 글자는 중앙 안전영역(80%) 안에 작게 둔다."""
    scale = 4
    box = size * scale
    img = Image.new("RGBA", (box, box), ACCENT)
    draw_letter(img, box, 0.36)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", rounded_icon(192)),
        ("icon-512.png", rounded_icon(512)),
        ("icon-maskable-512.png", maskable_icon(512)),
        ("apple-touch-icon.png", rounded_icon(180)),
    ]
    for name, image in targets:
        path = OUT / name
        image.save(path, "PNG")
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 스크립트를 실행해 아이콘을 만든다**

Run:
```bash
cd dawoo-erp && python scripts/gen-icons.py
```
Expected: 4줄이 출력되고 각 줄의 바이트 수가 0보다 크다. 예:
```
wrote .../public/icon-192.png (4231 bytes)
wrote .../public/icon-512.png (14882 bytes)
wrote .../public/icon-maskable-512.png (13104 bytes)
wrote .../public/apple-touch-icon.png (3902 bytes)
```

- [ ] **Step 3: 생성된 아이콘을 눈으로 확인한다**

Read 도구로 `dawoo-erp/public/icon-512.png` 를 연다(Read는 이미지를 렌더한다).
Expected: 터라코타 배경의 둥근 사각형 중앙에 흰색 `D`. 글자가 잘리거나 치우치지 않았고, 배경이 투명하게 뚫린 곳이 없다.

`public/icon-maskable-512.png` 도 같은 방식으로 확인한다.
Expected: 모서리까지 터라코타로 꽉 찼고(둥근 모서리 없음), `D`가 `icon-512`보다 작아 중앙에 여유가 있다.

문제가 있으면 Step 1의 `glyph_ratio` 또는 `radius_ratio`를 조정하고 Step 2부터 다시 한다.

- [ ] **Step 4: 커밋**

```bash
cd dawoo-erp && git add scripts/gen-icons.py public/icon-192.png public/icon-512.png public/icon-maskable-512.png public/apple-touch-icon.png && git commit -F - <<'EOF'
feat(pwa): 앱 아이콘 생성

로고 이미지 파일이 없어 Sidebar의 CSS 로고(터라코타 라운드 사각형 +
흰색 D)를 PNG로 래스터화. 재생성 가능하도록 스크립트를 남긴다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 웹앱 매니페스트

**Files:**
- Create: `src/app/manifest.ts`

**Interfaces:**
- Consumes: Task 1의 `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`
- Produces: `/manifest.webmanifest` 경로. Task 3의 `layout.tsx`가 `metadata.manifest`로 이 경로를 참조한다.

Next.js App Router는 `app/manifest.ts`의 default export를 `/manifest.webmanifest`로 서빙한다. 파일명이 `manifest.json`이 아니라 `manifest.webmanifest`라는 점에 주의한다.

- [ ] **Step 1: 매니페스트를 작성한다**

파일 `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

// 색상은 globals.css의 --color-accent / --color-page 와 같아야 한다.
// 매니페스트는 CSS 변수를 못 읽으므로 여기만 hex 리터럴을 쓴다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '다우 ERP',
    short_name: '다우ERP',
    description: '다우건설 AI 기반 ERP 시스템',
    lang: 'ko',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#c96442',
    background_color: '#f5f4ed',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Step 2: 타입 검사**

Run:
```bash
cd dawoo-erp && npx tsc --noEmit
```
Expected: 출력 없음(성공).

- [ ] **Step 3: 미들웨어에서 PWA 정적 자원을 인증 대상에서 뺀다**

`src/middleware.ts`의 matcher는 `'/((?!_next/static|_next/image|favicon.ico).*)'` 라서 `/manifest.webmanifest`, `/sw.js`, `/icon-*.png`가 전부 인증 검사를 탄다. 로그인한 사용자는 쿠키가 함께 나가 통과하지만, **크롬은 로그인 전에도 매니페스트와 아이콘을 읽어 설치 가능 여부를 판정한다.** 리다이렉트가 걸리면 설치 배너 자체가 뜨지 않는다.

27~30줄의 통과 조건을 아래로 교체한다:

```ts
  // /login, 정적 리소스는 인증 불필요 — 바로 통과
  // PWA 자원(매니페스트·워커·아이콘)은 크롬이 로그인 전에 읽어
  // 설치 가능 여부를 판정하므로 인증에서 뺀다. 민감 정보가 없다.
  if (
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/apple-touch-icon.png' ||
    pathname.startsWith('/icon-')
  ) {
    return NextResponse.next()
  }
```

- [ ] **Step 4: 매니페스트가 실제로 서빙되는지 확인한다**

`.claude/launch.json`의 `dev` 설정으로 프리뷰를 띄운다(`mcp__Claude_Browser__preview_start` with `{name: "dev"}`). 그다음 페이지에서 다음을 평가한다:

```js
(async () => {
  const r = await fetch('/manifest.webmanifest');
  const m = await r.json();
  return { status: r.status, name: m.name, start: m.start_url, display: m.display, icons: m.icons.length };
})()
```
Expected: `{status: 200, name: "다우 ERP", start: "/dashboard", display: "standalone", icons: 3}`

**로그인하지 않은 상태에서 200이 나와야 한다.** Step 3의 미들웨어 수정이 제대로 됐는지 확인하는 것이 이 단계의 핵심이다. 307 리다이렉트가 나오면 Step 3으로 돌아간다.

- [ ] **Step 5: 타입 검사와 린트**

Run:
```bash
cd dawoo-erp && npx tsc --noEmit && npx eslint src/app/manifest.ts src/middleware.ts
```
Expected: 둘 다 출력 없이 통과.

- [ ] **Step 6: 커밋**

```bash
cd dawoo-erp && git add src/app/manifest.ts src/middleware.ts && git commit -F - <<'EOF'
feat(pwa): 웹앱 매니페스트 추가

start_url을 /dashboard로 두어 앱 실행 시 바로 대시보드로 들어간다.
색상은 globals.css의 --color-accent / --color-page 와 동일.

매니페스트·워커·아이콘은 미들웨어 인증에서 뺀다 — 크롬이 로그인 전에
읽어 설치 가능 여부를 판정하는데, 리다이렉트가 걸리면 설치 배너가
아예 뜨지 않는다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: layout 메타데이터

**Files:**
- Modify: `src/app/layout.tsx:1-8`

**Interfaces:**
- Consumes: Task 2의 `/manifest.webmanifest`, Task 1의 `/apple-touch-icon.png`
- Produces: 없음(문서 `<head>` 출력만 바뀐다)

`viewport`는 `metadata`와 별개의 export다. `themeColor`를 `metadata`에 넣으면 Next.js가 경고를 낸다.

- [ ] **Step 1: import와 export를 수정한다**

`src/app/layout.tsx` 1~8줄을 아래로 교체한다. 나머지(10줄 이하 `RootLayout`)는 건드리지 않는다.

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "DAWOO ERP - 다우건설",
  description: "다우건설 AI 기반 ERP 시스템",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "다우ERP" },
  icons: { apple: "/apple-touch-icon.png" },
};

// themeColor는 metadata가 아니라 viewport에 있어야 한다(Next.js 규칙).
// maximumScale을 1로 막지 않는다 — 확대를 막으면 접근성 문제가 된다.
export const viewport: Viewport = {
  themeColor: "#c96442",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};
```

- [ ] **Step 2: 타입 검사와 빌드**

Run:
```bash
cd dawoo-erp && npx tsc --noEmit && npm run build
```
Expected: 타입 오류 없음. 빌드 성공. 출력에 `themeColor`/`viewport` 관련 경고가 **없어야** 한다.

- [ ] **Step 3: `<head>` 출력 확인**

프리뷰 페이지에서 평가한다:

```js
({
  manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
  theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content'),
  apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
})
```
Expected: `{manifest: "/manifest.webmanifest", theme: "#c96442", apple: "/apple-touch-icon.png"}`

- [ ] **Step 4: 커밋**

```bash
cd dawoo-erp && git add src/app/layout.tsx && git commit -F - <<'EOF'
feat(pwa): manifest 링크와 viewport 메타데이터 추가

themeColor는 Next.js 규칙에 따라 metadata가 아닌 viewport export에 둔다.
maximumScale은 5로 열어둔다 — 확대를 막으면 접근성 문제가 된다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 서비스워커

**Files:**
- Create: `public/sw.js`

**Interfaces:**
- Consumes: 없음
- Produces: `/sw.js` 경로. Task 5의 `ServiceWorkerRegistrar`가 등록한다. 푸시 payload 형식은 3단계에서 서버가 이 형식으로 보낸다: `{ title: string, body: string, url?: string }`

캐싱을 넣지 않는다. 이 워커가 하는 일은 즉시 활성화, 푸시 수신, 알림 클릭 처리뿐이다.

- [ ] **Step 1: 서비스워커를 작성한다**

파일 `public/sw.js`:

```js
// 다우 ERP 서비스워커 — 푸시 수신 전용. 캐싱하지 않는다(온라인 전용 앱).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: '다우 ERP', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || '다우 ERP', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'dawoo-erp',
      data: { url: payload.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // 이미 열린 앱 창이 있으면 그 창을 쓴다. 매번 새로 열면 창이 쌓인다.
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
```

- [ ] **Step 2: 문법 검사**

Run:
```bash
cd dawoo-erp && node --check public/sw.js
```
Expected: 출력 없음(성공).

- [ ] **Step 3: 커밋**

```bash
cd dawoo-erp && git add public/sw.js && git commit -F - <<'EOF'
feat(pwa): 푸시 전용 서비스워커 추가

온라인 전용 앱이라 캐싱하지 않는다. 캐싱을 안 하니 Serwist 같은
번들러 플러그인이 필요 없고, Turbopack과 충돌하지 않는다.

알림 클릭 시 열린 창이 있으면 재사용한다 — 매번 openWindow를 부르면
앱 창이 쌓인다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 서비스워커 등록 + 설치 배너

**Files:**
- Create: `src/components/pwa/ServiceWorkerRegistrar.tsx`
- Create: `src/components/pwa/InstallBanner.tsx`
- Modify: `src/components/ClientLayout.tsx`

**Interfaces:**
- Consumes: Task 4의 `/sw.js`, Task 1의 아이콘(배너 안에서 `/icon-192.png` 사용)
- Produces: `ServiceWorkerRegistrar` (default export, props 없음, 렌더 출력 없음), `InstallBanner` (default export, props 없음)

`beforeinstallprompt`는 표준 TypeScript DOM 타입에 없다. 로컬 인터페이스를 선언해서 쓴다.

- [ ] **Step 1: 서비스워커 등록 컴포넌트를 작성한다**

파일 `src/components/pwa/ServiceWorkerRegistrar.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

// 서비스워커 등록만 담당한다. 렌더 출력 없음.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* 등록 실패해도 앱 동작에는 지장 없음 */ })
  }, [])

  return null
}
```

- [ ] **Step 2: 설치 배너를 작성한다**

파일 `src/components/pwa/InstallBanner.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

// beforeinstallprompt는 표준 DOM 타입에 없어 직접 선언한다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'dawoo_install_dismissed'

export default function InstallBanner() {
  // 이벤트가 오기 전에는 null이라 아무것도 렌더되지 않는다.
  // 별도의 dismissed 상태가 필요 없는 이유. (effect 안에서 동기적으로
  // setState를 하면 react-hooks/set-state-in-effect 린트에 걸린다.)
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // 이미 설치돼 실행 중이거나 사용자가 닫은 적이 있으면 구독하지 않는다.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (e: Event) => {
      e.preventDefault()  // 크롬 기본 배너를 막고 우리 배너를 쓴다
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPromptEvent(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    await promptEvent.userChoice
    setPromptEvent(null)
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setPromptEvent(null)
  }

  // 이벤트가 오지 않으면(설치 불가 환경) 아무것도 렌더하지 않는다.
  if (!promptEvent) return null

  return (
    <div className="md:hidden mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border-accent bg-surface p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-[20px] font-semibold text-white">
        D
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-txt-primary">앱으로 설치</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-txt-secondary">
          홈 화면에 추가하면 주소창 없이 열립니다
        </p>
      </div>
      <button
        onClick={install}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
      >
        <Download size={14} />
        설치
      </button>
      <button
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="shrink-0 text-txt-quaternary hover:text-txt-secondary"
      >
        <X size={16} />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: `border-border-accent` 토큰이 존재하는지 확인한다**

Run:
```bash
cd dawoo-erp && grep -n "border-accent" src/app/globals.css
```
Expected: `--color-border-accent` 정의가 한 줄 이상 나온다.

없으면 `InstallBanner.tsx`의 `border-border-accent`를 `border-border-primary`로 바꾼다.

- [ ] **Step 4: ClientLayout에 삽입한다**

`src/components/ClientLayout.tsx`를 수정한다. 세 곳이다.

첫째, import 추가 (8줄 `import { Menu } from 'lucide-react'` 아래):

```tsx
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar"
import InstallBanner from "@/components/pwa/InstallBanner"
```

둘째, 모바일 상단바(36줄 `</div>`) 바로 다음, `<div className="px-4 py-4 ...">` 바로 앞에 배너를 넣는다:

```tsx
        <InstallBanner />
```

셋째, `AuthenticatedLayout`의 `<Toaster />` 다음 줄에 등록 컴포넌트를 넣는다:

```tsx
      <ServiceWorkerRegistrar />
```

수정 후 `AuthenticatedLayout`의 return 블록은 이렇게 된다:

```tsx
  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="md:ml-[240px] min-h-screen bg-page">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-border-primary sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-tertiary">
            <Menu size={20} className="text-txt-secondary" />
          </button>
          <span className="text-[14px] font-semibold text-txt-primary">DAWOO ERP</span>
          <div className="w-9" /> {/* spacer */}
        </div>
        <InstallBanner />
        <div className="px-4 py-4 md:px-8 md:py-6">
          {children}
        </div>
      </main>
      <AIAssistant />
      <Toaster />
      <ServiceWorkerRegistrar />
    </>
  )
```

주의: 15줄의 `if (pathname === '/login') return <>{children}</>` 는 그대로 둔다. 로그인 화면에는 배너도 워커 등록도 하지 않는다 — 설치는 로그인 후에 안내하는 게 맞다.

- [ ] **Step 5: 타입·린트·빌드 검사**

Run:
```bash
cd dawoo-erp && npx tsc --noEmit && npx eslint src/components/pwa/ServiceWorkerRegistrar.tsx src/components/pwa/InstallBanner.tsx src/components/ClientLayout.tsx && npm run build
```
Expected: 세 명령 모두 오류 없이 통과. eslint는 출력이 없어야 한다.

- [ ] **Step 6: 서비스워커가 실제로 등록되는지 확인한다**

프리뷰를 띄우고 로그인된 상태(또는 `SKIP_AUTH=1`)로 `/dashboard`에 들어간 뒤 평가한다:

```js
(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    hasRegistration: !!reg,
    scriptURL: reg && reg.active && reg.active.scriptURL,
    controller: !!navigator.serviceWorker.controller,
  };
})()
```
Expected: `hasRegistration: true`, `scriptURL`이 `/sw.js`로 끝난다. (`controller`는 최초 로드 직후 false일 수 있다 — 새로고침하면 true가 된다.)

콘솔 에러도 확인한다. CSP 위반(`Refused to create a worker`)이 보이면 Task 6에서 해결한다.

- [ ] **Step 7: 커밋**

```bash
cd dawoo-erp && git add src/components/pwa/ src/components/ClientLayout.tsx && git commit -F - <<'EOF'
feat(pwa): 서비스워커 등록 + 설치 배너

크롬 기본 배너를 preventDefault로 막고 앱 안에 자체 배너를 띄운다.
사파리에서는 동작하지 않는 방식이지만 대상이 전원 안드로이드라 무관하고,
안내 문구를 우리가 통제할 수 있다.

이미 설치됨 / 사용자가 닫음 / 이벤트 미수신 / md 이상 화면에서는
렌더하지 않는다. 로그인 화면에서도 띄우지 않는다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 보안 헤더

**Files:**
- Modify: `next.config.ts:26-36` (CSP), `next.config.ts:4-39` (headers 배열)

**Interfaces:**
- Consumes: Task 4의 `/sw.js`
- Produces: 없음

현재 CSP에는 `worker-src` 디렉티브가 없어 `script-src 'self'`로 폴백되고, 그 결과 동일 출처인 `/sw.js` 등록은 이미 통과한다. 그래도 의도를 코드에 고정해두면 나중에 `script-src`를 조이더라도 워커가 깨지지 않는다.

- [ ] **Step 1: CSP에 `worker-src`를 추가한다**

`next.config.ts` 28줄 `"default-src 'self'",` 다음 줄에 한 줄을 넣는다:

```ts
              "worker-src 'self'",
```

- [ ] **Step 2: `/sw.js` 전용 헤더를 추가한다**

`next.config.ts`의 `headers()` 반환 배열에서, 기존 `/(.*)` 객체 **뒤에** 객체 하나를 더 넣는다. 반환문은 이렇게 된다:

```ts
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // ... 기존 헤더 전부 그대로 ...
        ],
      },
      {
        // 워커가 캐시되면 갱신이 늦는다. 항상 새로 받게 한다.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
```

- [ ] **Step 3: 헤더가 적용되는지 확인한다**

프리뷰를 재시작(설정 변경은 hot reload가 안 된다)한 뒤 평가한다:

```js
(async () => {
  const r = await fetch('/sw.js', { cache: 'no-store' });
  return {
    status: r.status,
    type: r.headers.get('content-type'),
    cache: r.headers.get('cache-control'),
  };
})()
```
Expected: `status: 200`, `type`에 `javascript` 포함, `cache`에 `no-store` 포함.

- [ ] **Step 4: 빌드 검사**

Run:
```bash
cd dawoo-erp && npm run build
```
Expected: 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
cd dawoo-erp && git add next.config.ts && git commit -F - <<'EOF'
feat(pwa): worker-src 명시 + sw.js 캐시 금지 헤더

worker-src가 없으면 script-src로 폴백돼 지금도 통과하지만,
나중에 script-src를 조일 때 워커가 조용히 깨지는 걸 막는다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: 배포 및 실기기 확인

**Files:** 없음(배포와 검증만)

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: 없음

- [ ] **Step 1: `SKIP_AUTH`가 남아 있지 않은지 확인한다**

Run:
```bash
cd dawoo-erp && grep -c "SKIP_AUTH" .env.local || echo "없음(정상)"
```
Expected: `없음(정상)` 또는 `0`. 값이 1 이상이면 해당 줄을 지운다. 로컬 인증 우회가 남아 있으면 안 된다.

- [ ] **Step 2: 전체 검증**

Run:
```bash
cd dawoo-erp && npx tsc --noEmit && npm run build
```
Expected: 둘 다 통과.

- [ ] **Step 3: 푸시**

```bash
cd dawoo-erp && git push origin main
```
Expected: `main -> main` 갱신 출력.

- [ ] **Step 4: 배포 완료를 기다린다**

Run:
```bash
cd dawoo-erp && npx vercel ls --yes 2>&1 | sed -n '8p'
```
`● Building`이면 잠시 후 다시 확인한다. Expected: 최신 배포가 `● Ready`.

- [ ] **Step 5: 프로덕션에서 매니페스트와 워커를 확인한다**

브라우저로 `https://dawoo-erp-web.vercel.app/` 에 접속한다(로그인 화면이 뜬다). 로그인 화면에서도 정적 자원은 받을 수 있으므로 평가한다:

```js
(async () => {
  const m = await fetch('/manifest.webmanifest');
  const s = await fetch('/sw.js');
  return { manifest: m.status, sw: s.status, swCache: s.headers.get('cache-control') };
})()
```
Expected: `{manifest: 200, sw: 200, swCache: "no-cache, no-store, must-revalidate"}`

로그인하지 않은 상태에서 200이어야 한다. 307이 나오면 Task 2 Step 3의 미들웨어 수정이 배포에 반영되지 않은 것이다.

- [ ] **Step 6: 사용자에게 실기기 확인을 요청한다**

여기부터는 실제 안드로이드 폰이 필요해 자동 검증이 불가능하다. 사용자에게 다음을 요청한다:

1. 폰 크롬으로 `https://dawoo-erp-web.vercel.app/` 접속 후 로그인
2. 대시보드 상단에 "앱으로 설치" 배너가 뜨는지
3. 설치를 누르면 크롬 설치 창이 뜨는지
4. 앱 서랍에 "다우ERP" 아이콘이 생기는지
5. 아이콘으로 실행했을 때 주소창 없이 대시보드가 뜨는지

배너가 안 뜨는 경우의 원인을 함께 안내한다: 이미 설치했거나, 배너를 닫은 적이 있거나(크롬 설정 > 사이트 데이터 삭제로 초기화), 크롬이 설치 조건을 아직 판정하지 못한 경우(새로고침).

---

## Self-Review

**1. 스펙 커버리지** — 설계 문서 1단계의 항목별 대응: 1-1 매니페스트 → Task 2. 1-2 아이콘 → Task 1. 1-3 메타데이터 → Task 3. 1-4 서비스워커 → Task 4. 1-5 설치 배너 → Task 5. 1-6 헤더 → Task 6. 1-7 완료 기준 → Task 7. 누락 없음.

**2. 플레이스홀더** — "TBD", "적절히 처리", "위와 비슷하게" 없음. 모든 코드 단계에 실제 코드가 들어 있다.

**3. 타입 일관성** — `/manifest.webmanifest`(Task 2 생성 → Task 3·7 참조), `/sw.js`(Task 4 생성 → Task 5 등록, Task 6 헤더, Task 7 확인), `/icon-192.png`(Task 1 생성 → Task 2 매니페스트, Task 4 알림 아이콘), `/apple-touch-icon.png`(Task 1 → Task 3). 푸시 payload `{title, body, url?}`는 Task 4가 정의하고 3단계 서버가 따른다. 이름 불일치 없음.

**설계 문서에 없던 추가 작업** — Task 2 Step 3(미들웨어 예외)은 설계 문서에 없다. 계획을 쓰면서 발견한 필수 작업이다. matcher가 `'/((?!_next/static|_next/image|favicon.ico).*)'` 라서 `/manifest.webmanifest`·`/sw.js`·`/icon-*.png`가 전부 인증 검사를 타고, 크롬은 로그인 전에 이 파일들을 읽어 설치 가능 여부를 판정한다. 이 수정이 없으면 설치 배너가 아예 뜨지 않는다. 설계 문서에도 반영해야 한다.
