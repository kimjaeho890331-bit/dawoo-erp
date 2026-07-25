// 다우 ERP 서비스워커 — 푸시 수신 + 오프라인 안내.
//
// 온라인 전용 앱이라 콘텐츠를 캐싱하지 않는다. 다만 fetch 핸들러 자체는
// 반드시 있어야 한다 — 크롬은 fetch 핸들러가 없으면 beforeinstallprompt를
// 쏘지 않아 설치 배너가 아예 뜨지 않는다. 빈 핸들러는 크롬이 무시하므로
// 실제로 동작하는 코드여야 한다.
// 그래서 화면 이동 요청만 가로채 네트워크를 먼저 시도하고, 실패하면
// 안내 페이지를 보여준다. 나머지 요청(정적 자원·API)은 손대지 않아
// 서비스워커를 거치는 지연이 생기지 않는다.

const CACHE = 'dawoo-erp-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // 화면 이동만 처리한다. 그 외에는 respondWith를 부르지 않아
  // 브라우저 기본 동작이 그대로 유지된다.
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  )
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
