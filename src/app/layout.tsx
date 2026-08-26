import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiliProfile Analyzer",
  description: "面向普通 Bilibili 用户的公开数据画像分析 Web App",
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
        {children}
      </body>
    </html>
  );
}
