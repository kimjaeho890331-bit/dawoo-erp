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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/*
          크롬은 beforeinstallprompt를 페이지 로드당 한 번만 쏘고, 그 시점이
          React 하이드레이션보다 빠를 수 있다. useEffect에서 듣기 시작하면
          이미 지나간 신호를 놓쳐 설치 배너가 영영 안 뜬다.
          그래서 React보다 먼저 실행되는 여기서 잡아 window에 보관한다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  window.__dawooInstall = { event: null, fired: false, at: null };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__dawooInstall.event = e;
    window.__dawooInstall.fired = true;
    window.__dawooInstall.at = Date.now();
    window.dispatchEvent(new Event('dawoo:installready'));
  });
  window.addEventListener('appinstalled', function () {
    window.__dawooInstall.event = null;
    window.dispatchEvent(new Event('dawoo:installdone'));
  });
})();`,
          }}
        />
        {/* Pretendard Variable (Korean) */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* Inter Variable (English/Numbers) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-page text-txt-primary">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
