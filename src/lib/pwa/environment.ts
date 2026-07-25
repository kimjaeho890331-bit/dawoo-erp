// 설치 배너가 어떤 안내를 보여줄지 결정하기 위한 실행 환경 판별.
//
// 핵심 배경: PWA 설치는 브라우저가 beforeinstallprompt를 줘야만 코드로
// 실행할 수 있다. 신호가 없으면 웹페이지가 설치를 강제할 방법이 없다.
// 그래서 "왜 신호가 없는가"를 환경으로 구분해 맞는 안내를 내보낸다.

export type BrowserKind =
  | 'chrome'          // 안드로이드 크롬 — 설치 가능
  | 'samsung'         // 삼성 인터넷 — 삼성 기기에서 설치 가능
  | 'inapp'           // 카톡·네이버 등 내장 브라우저 — 설치 불가
  | 'other'

export interface PwaEnvironment {
  browser: BrowserKind
  /** 내장 브라우저 이름 (안내 문구용). 판별 못 하면 null */
  inAppName: string | null
  isAndroid: boolean
  isStandalone: boolean
}

// 국내에서 실제로 자주 쓰이는 내장 브라우저들.
// UA 조각 → 사용자에게 보여줄 이름
const IN_APP_SIGNATURES: [RegExp, string][] = [
  [/KAKAOTALK/i, '카카오톡'],
  [/NAVER\(inapp/i, '네이버 앱'],
  [/DaumApps|DaumDevice/i, '다음 앱'],
  [/Instagram/i, '인스타그램'],
  [/FBAN|FBAV|FB_IAB/i, '페이스북'],
  [/Line\//i, '라인'],
  [/everytimeApp/i, '에브리타임'],
]

export function detectEnvironment(): PwaEnvironment {
  const ua = navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // 안드로이드 WebAPK는 standalone으로 잡히지만, 혹시 모를 경우 대비
    document.referrer.startsWith('android-app://')

  for (const [pattern, name] of IN_APP_SIGNATURES) {
    if (pattern.test(ua)) {
      return { browser: 'inapp', inAppName: name, isAndroid, isStandalone }
    }
  }

  if (/SamsungBrowser/i.test(ua)) {
    return { browser: 'samsung', inAppName: null, isAndroid, isStandalone }
  }

  // Edge(EdgA)·Opera(OPR)·Whale도 Chrome 문자열을 갖지만 설치를 지원한다.
  // 여기서는 "설치 가능한 크로미움 계열"로 묶어 chrome으로 본다.
  if (/Chrome|CriOS|EdgA|OPR|Whale/i.test(ua)) {
    return { browser: 'chrome', inAppName: null, isAndroid, isStandalone }
  }

  return { browser: 'other', inAppName: null, isAndroid, isStandalone }
}

/**
 * 안드로이드에서 현재 주소를 크롬으로 다시 여는 intent URL.
 * 내장 브라우저에 갇혔을 때 탈출용.
 */
export function chromeIntentUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//, '')
  return `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`
}
