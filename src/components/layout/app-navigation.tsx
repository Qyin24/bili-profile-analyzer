"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  FileText,
  Layers,
  Network,
  Settings,
  ShieldCheck,
  PlusCircle,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItemConfig {
  name: string;
  fullName: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { name: "开始", fullName: "开始分析", href: "/", icon: Sparkles },
  { name: "报告", fullName: "我的报告", href: "/dashboard", icon: FileText },
  { name: "分析", fullName: "我的分析", href: "/history", icon: History },
  { name: "主题", fullName: "内容主题", href: "/entities", icon: Layers },
  { name: "关系", fullName: "关系概览", href: "/graph", icon: Network },
  { name: "设置", fullName: "设置", href: "/settings", icon: Settings },
];

export function AppNavigation() {
  const pathname = usePathname();

  const isNavActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/70 bg-card/80 backdrop-blur-md min-h-screen p-4 justify-between sticky top-0">
        <div className="space-y-6">
          {/* Brand header */}
          <div className="px-2 py-2">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground tracking-tight">BiliProfile</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">公开内容偏好分析</p>
              </div>
            </Link>
          </div>

          {/* Quick Action: Start New Analysis */}
          <div className="px-1">
            <Link
              href="/"
              className={cn(
                "flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-2xl text-xs font-semibold transition-all shadow-sm",
                pathname === "/"
                  ? "bg-primary text-primary-foreground shadow-primary/25"
                  : "bg-secondary/70 text-secondary-foreground hover:bg-secondary border border-border/60"
              )}
            >
              <PlusCircle className="w-4 h-4" />
              <span>新建分析</span>
            </Link>
          </div>

          {/* Nav links */}
          <nav className="space-y-1" aria-label="主功能导航">
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              功能导航
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all group",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-semibold"
                      : "text-foreground/80 hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-transform group-hover:scale-105",
                      active ? "text-primary-foreground" : "text-muted-foreground"
                    )}
                  />
                  <span>{item.fullName}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-3.5 rounded-2xl bg-muted/50 border border-border/60 text-[11px] text-muted-foreground space-y-1.5">
          <div className="font-semibold text-foreground/90 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>隐私优先</span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            仅使用公开可见信息与你主动补充的内容。未访问外部模型或非公开账号。
          </p>
        </div>
      </aside>

      {/* Mobile Fixed Bottom TabBar (390px responsive) */}
      <nav
        aria-label="移动端底部导航"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/80 px-1 py-1 shadow-lg safe-area-bottom w-full"
      >
        <div className="flex items-center justify-between w-full max-w-md mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl text-[10px] transition-colors gap-0.5 min-w-0 text-center",
                  active
                    ? "text-primary font-bold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate leading-none text-[10px] w-full text-center">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
