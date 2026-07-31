import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버를 폰에서 열어 화면을 확인할 때 필요하다. Next는 다른 호스트에서 오는
  // /_next 개발 리소스 요청을 기본으로 막는데, 막히면 JS가 로드되지 않아 화면이
  // "로딩 중…"에서 멈춘다. 개발 서버에만 적용되는 설정이라 배포본에는 영향이 없다.
  allowedDevOrigins: ['192.168.0.18'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "worker-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
              "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://business.juso.go.kr https://apis.data.go.kr https://open.neis.go.kr https://*.kakao.com https://cdn.jsdelivr.net",
              "frame-ancestors 'none'",
            ].join('; '),
          },
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
};

export default nextConfig;
