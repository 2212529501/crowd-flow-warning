import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "城市流动哨兵 | AI 事件检索与预警",
  description: "面向城市运营的 AI 事件检索、风险分级与人群流动预警工作台"
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
