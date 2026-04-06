import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DAWOO ERP - 다우건설",
  description: "다우건설 AI 기반 ERP 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geist.className} bg-gray-50`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}