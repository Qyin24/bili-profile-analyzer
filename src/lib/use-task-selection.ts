"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  mapHttpErrorToSafeMessage,
  mapNetworkErrorToSafeMessage,
  SafeUiError,
} from "@/lib/ui-error-mapper";

export type TaskSelectionState =
  | { type: "LOADING" }
  | { type: "ERROR"; error: SafeUiError }
  | { type: "NO_TASK_SELECTED"; tasks: TaskSummaryResponse[] }
  | { type: "NOT_FOUND"; invalidTaskId: string; tasks: TaskSummaryResponse[] }
  | { type: "TASK_SELECTED"; task: TaskSummaryResponse; tasks: TaskSummaryResponse[] };

/**
 * Shared task selection hook for /entities and /graph pages.
 * Handles URL ?taskId=<id> validation, task list fetching, AbortController protection,
 * race-condition prevention, and clean route updating.
 */
export function useTaskSelection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTaskId = searchParams ? searchParams.get("taskId") : null;

  const [tasks, setTasks] = React.useState<TaskSummaryResponse[]>([]);
  const [state, setState] = React.useState<TaskSelectionState>({ type: "LOADING" });
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const activeRequestIdRef = React.useRef<number>(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const loadTasks = React.useCallback(async (showRefreshingSpinner = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++activeRequestIdRef.current;

    if (showRefreshingSpinner) {
      setIsRefreshing(true);
    } else {
      setState({ type: "LOADING" });
    }

    try {
      const resp = await fetch("/api/tasks", { signal: controller.signal });
      if (activeRequestIdRef.current !== requestId) return;

      if (!resp.ok) {
        const safeError = mapHttpErrorToSafeMessage(resp.status);
        setState({ type: "ERROR", error: safeError });
        return;
      }

      const allTasks: TaskSummaryResponse[] = await resp.json();
      if (activeRequestIdRef.current !== requestId) return;

      setTasks(allTasks);

      if (urlTaskId) {
        // Exact opaque string matching without assuming UUID format
        const matched = allTasks.find((t) => t.id === urlTaskId);
        if (matched) {
          setState({ type: "TASK_SELECTED", task: matched, tasks: allTasks });
        } else {
          setState({ type: "NOT_FOUND", invalidTaskId: urlTaskId, tasks: allTasks });
        }
      } else {
        setState({ type: "NO_TASK_SELECTED", tasks: allTasks });
      }
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== requestId) return;
      const safeError = mapNetworkErrorToSafeMessage(err);
      if (safeError) {
        setState({ type: "ERROR", error: safeError });
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsRefreshing(false);
      }
    }
  }, [urlTaskId]);

  React.useEffect(() => {
    loadTasks();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadTasks]);

  const selectTask = React.useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("taskId", taskId);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const clearSelection = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("taskId");
    const newQuery = params.toString();
    router.push(newQuery ? `${pathname}?${newQuery}` : pathname);
  }, [pathname, router, searchParams]);

  return {
    state,
    tasks,
    urlTaskId,
    isRefreshing,
    refresh: () => loadTasks(true),
    selectTask,
    clearSelection,
  };
}
