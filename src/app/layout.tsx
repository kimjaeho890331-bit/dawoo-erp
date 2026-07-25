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
