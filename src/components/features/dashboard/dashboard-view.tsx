"use client";

import * as React from "react";
import { TaskSimulator } from "./task-simulator";
import { TaskSummary, PersistedTaskSummaryItem } from "./task-summary";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardView() {
  const [tasks, setTasks] = React.useState<PersistedTaskSummaryItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const fetchTasks = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `获取任务失败 (HTTP ${res.status})`);
      }
      const data = await res.json();
      setTasks(data);
    } catch (err: unknown) {
      console.error("Failed to fetch tasks from /api/tasks:", err);
      setLoadError(err instanceof Error ? err.message : "无法连接本地数据库或加载任务列表");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="space-y-6">
      {/* API Failure Notice with Retry Button */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>数据库任务列表加载异常：</strong> {loadError}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            className="text-xs gap-1 self-start sm:self-auto border-rose-300 text-rose-800 hover:bg-rose-100 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            重试加载
          </Button>
        </div>
      )}

      {/* Interactive Task Pipeline Simulator (Persists to SQLite via API) */}
      <TaskSimulator onTaskChange={fetchTasks} />

      {/* Aggregated Overview & Recent Tasks (Fetched directly from DB via API) */}
      <TaskSummary tasks={tasks} isLoading={isLoading} onRefresh={fetchTasks} />
    </div>
  );
}
