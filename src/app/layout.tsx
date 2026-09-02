import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AiConfigProvider } from "@/lib/ai-config-context";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "BiliProfile Analyzer",
  description: "面向 Bilibili 用户的公开内容偏好分析工具：基于公开可见数据，生成可回看的内容主题与关注关系画像。",
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
          {children}
        </AiConfigProvider>
      </body>
    </html>
  );
}
