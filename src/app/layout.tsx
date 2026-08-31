import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MockTaskProvider } from "@/lib/mock-task-context";
import { AiConfigProvider } from "@/lib/ai-config-context";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "BiliProfile Analyzer · 演示模式",
  description: "面向普通 Bilibili 用户的公开数据画像分析 Web App (本地演示模式)",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased font-sans">
        <AiConfigProvider>
          <MockTaskProvider>{children}</MockTaskProvider>
        </AiConfigProvider>
      </body>
    </html>
  );
}
