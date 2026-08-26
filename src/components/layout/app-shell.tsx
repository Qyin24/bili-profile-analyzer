import * as React from "react";
import { AppNavigation } from "./app-navigation";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  headerAction?: React.ReactNode;
}

export function AppShell({
  children,
  className,
  headerTitle,
  headerSubtitle,
  headerAction,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row antialiased selection:bg-primary/20 selection:text-primary">
      {/* Universal Navigation */}
      <AppNavigation />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8">
        {/* Top Friendly Notice Banner */}
        <div className="bg-primary/10 border-b border-border/50 px-4 py-1.5 text-center text-xs font-medium text-foreground/90 flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>演示模式：当前仅展示本地示例数据，不会访问 Bilibili 或读取真实账号信息。</span>
        </div>

        {/* Page Content Container */}
        <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-5 sm:py-7 space-y-6">
          {(headerTitle || headerAction) && (
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border/40">
              <div className="space-y-1">
                {headerTitle && (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {headerTitle}
                  </h1>
                )}
                {headerSubtitle && (
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
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
