"use client";

import * as React from "react";
import Link from "next/link";
import { AppNavigation } from "./app-navigation";
import { cn } from "@/lib/utils";
import { Sparkles, Info, PlusCircle } from "lucide-react";

export interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  headerAction?: React.ReactNode;
  showNewAnalysisButton?: boolean;
}

export function AppLayout({
  children,
  className,
  headerTitle,
  headerSubtitle,
  headerAction,
  showNewAnalysisButton = false,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row antialiased selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      {/* Universal Navigation */}
      <AppNavigation />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8 w-full">
        {/* Top Header Bar for Mobile & Desktop */}
        <header className="bg-card/70 backdrop-blur-md border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="md:hidden flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">BiliProfile</span>
            </Link>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary rounded-full border border-primary/20 shrink-0">
              隐私优先
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showNewAnalysisButton && (
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>新建分析</span>
              </Link>
            )}
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="hidden sm:inline">仅公开数据</span>
            </div>
          </div>
        </header>

        {/* Friendly Top Notice Banner */}
        <div className="bg-primary/10 border-b border-primary/15 px-3 py-2 text-xs font-medium text-foreground/90 flex items-center justify-center text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs leading-relaxed text-center">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>仅基于公开可见的 Bilibili 数据与你主动补充的内容进行分析</span>
          </div>
        </div>

        {/* Page Content Container */}
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-5 sm:py-7 space-y-6">
          {(headerTitle || headerAction) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
              <div className="space-y-1">
                {headerTitle && (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">
                    {headerTitle}
                  </h1>
                )}
                {headerSubtitle && (
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed break-words">
                    {headerSubtitle}
                  </p>
                )}
              </div>
              {headerAction && <div className="shrink-0">{headerAction}</div>}
            </div>
          )}

          <div className={cn("space-y-6", className)}>{children}</div>
        </main>
      </div>
    </div>
  );
}
