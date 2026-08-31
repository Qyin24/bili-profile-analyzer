"use client";

import * as React from "react";
import { TaskCreationCard } from "./task-creation-card";
import { TaskDetailCard } from "./task-detail-card";
import { TaskSummary } from "./task-summary";
import { TaskSummaryResponse } from "@/types/task-api";
import { AlertCircle, RefreshCw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  mapHttpErrorToSafeMessage,
  mapNetworkErrorToSafeMessage,
} from "@/lib/ui-error-mapper";

export function DashboardView() {
  const [tasks, setTasks] = React.useState<TaskSummaryResponse[]>([]);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const activeRequestIdRef = React.useRef<number>(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchTasks = React.useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const res = await fetch("/api/tasks", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (activeRequestIdRef.current !== requestId) return;

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const safeErr = mapHttpErrorToSafeMessage(res.status, errJson?.error?.code);
        setLoadError(safeErr.message);
        return;
      }

      const data: TaskSummaryResponse[] = await res.json();
      if (activeRequestIdRef.current !== requestId) return;

      setTasks(data);

      if (data.length > 0) {
        setSelectedTaskId((prev) => {
          if (prev && data.some((t) => t.id === prev)) {
            return prev;
          }
          return data[0].id;
        });
      } else {
        setSelectedTaskId(null);
      }
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== requestId) return;
      const safeErr = mapNetworkErrorToSafeMessage(err);
      if (safeErr) {
        setLoadError(safeErr.message);
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    fetchTasks();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchTasks]);

  const handleTaskCreated = (newTask: TaskSummaryResponse) => {
    setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);
    setSelectedTaskId(newTask.id);
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  return (
    <div className="space-y-6">
      {/* Environment & Persistence Disclaimer */}
      <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/80 text-xs text-muted-foreground leading-relaxed flex items-start gap-2.5 shadow-xs">
        <Database className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5 min-w-0">
          <span className="font-semibold text-foreground block">
            本地保存的分析记录
          </span>
          <p className="break-words">
            这次分析会保留在当前设备上，刷新页面后仍可继续查看。未接入外部账号。
          </p>
        </div>
      </div>

      {/* API Failure Notice with Retry Button */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>分析记录加载异常：</strong> {loadError}
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

      {/* 1. Task Creation Section */}
      <TaskCreationCard onTaskCreated={handleTaskCreated} />

      {/* 2. Selected Task Detail Card */}
      {selectedTask && <TaskDetailCard task={selectedTask} />}

      {/* 3. Aggregated Overview & Recent Tasks List */}
      <TaskSummary
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelectTask={(id) => setSelectedTaskId(id)}
        isLoading={isLoading}
        onRefresh={fetchTasks}
      />
    </div>
  );
}
