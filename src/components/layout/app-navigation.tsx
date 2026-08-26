"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Tag,
  GitFork,
  Sparkles,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItemConfig {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { name: "开始分析", href: "/dashboard", icon: Compass },
  { name: "关注内容", href: "/entities", icon: Tag },
  { name: "关系概览", href: "/graph", icon: GitFork },
  { name: "分析报告", href: "/analysis", icon: Sparkles },
  { name: "设置", href: "/settings", icon: Settings },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border/70 bg-card/70 backdrop-blur-md min-h-screen p-4 justify-between sticky top-0">
        <div className="space-y-6">
          {/* Brand header */}
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground tracking-tight">BiliProfile</h1>
                <p className="text-[11px] text-muted-foreground">公开内容偏好分析</p>
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="space-y-1" aria-label="主功能导航">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all group",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-semibold"
                      : "text-foreground/80 hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-transform group-hover:scale-105",
                      isActive ? "text-primary-foreground" : "text-muted-foreground"
                    )}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/50 text-[11px] text-muted-foreground space-y-1.5">
          <div className="font-semibold text-foreground/90 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>合规与隐私保护</span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            仅基于公开可查信息与自述生成偏好参考，不获取私密数据与登录凭证。
          </p>
        </div>
      </aside>

      {/* Mobile Fixed Bottom TabBar */}
      <nav
        aria-label="移动端底部导航"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/80 px-2 py-1.5 shadow-lg safe-area-bottom"
      >
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] transition-colors gap-1",
                  isActive
                    ? "text-primary font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate leading-none">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
