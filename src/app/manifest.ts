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
