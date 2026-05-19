import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 区域人群流动预警系统",
  description: "基于新闻和公共事件的人群流动影响分析 MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
