"use client";

import * as React from "react";
import {
  AnalysisTask,
  PipelineStage,
  SelfProvidedProfile,
  ConsentScope,
} from "@/types/analysis";
import {
  PIPELINE_STAGES_CONFIG,
  MOCK_INITIAL_TASK,
  MOCK_SELF_PROFILE,
  MOCK_TARGET,
  MOCK_TOPIC_TAXONOMY,
  MOCK_FOLLOW_ENTITIES,
} from "@/lib/mock-data";

interface MockTaskContextType {
  currentTask: AnalysisTask | null;
  selfProfile: SelfProvidedProfile;
  isReportPurged: boolean;
  demoTarget: typeof MOCK_TARGET;
  demoTopicTaxonomy: typeof MOCK_TOPIC_TAXONOMY;
  demoFollowEntities: typeof MOCK_FOLLOW_ENTITIES;
  startDemoAnalysis: (input: string) => AnalysisTask;
  advanceStage: () => void;
  completeAllStages: () => void;
  resetDemoTask: () => void;
  setStage: (stage: PipelineStage) => void;
  updateSelfProfile: (profile: SelfProvidedProfile) => void;
  revokeSelfProfileConsent: () => void;
  purgeSelfProfileAndDerivedData: () => void;
}

const MockTaskContext = React.createContext<MockTaskContextType | undefined>(undefined);

export function MockTaskProvider({ children }: { children: React.ReactNode }) {
  // In-memory task state (resets on page refresh as expected in Phase 2)
  const [currentTask, setCurrentTask] = React.useState<AnalysisTask | null>(() => ({
    ...MOCK_INITIAL_TASK,
    taskStatus: "COMPLETED",
    pipelineStage: "REPORT",
    outcome: "FULL",
    progress: 100,
    currentStageMessage: "分析报告已生成",
    completedAt: "2026-08-28 10:15:02",
  }));

  // In-memory self profile state
  const [selfProfile, setSelfProfile] = React.useState<SelfProvidedProfile>(() => ({
    ...MOCK_SELF_PROFILE,
  }));

  // In-memory purge invalidation state
  const [isReportPurged, setIsReportPurged] = React.useState<boolean>(false);

  // Helper to extract UID from user input
  const parseUidFromInput = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return "202688";

    // Match space.bilibili.com/<uid>
    const match = trimmed.match(/space\.bilibili\.com\/(\d+)/i);
    if (match && match[1]) {
      return match[1];
    }
    // Match pure digits
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    // Strip trailing slashes or path symbols
    const cleanDigits = trimmed.replace(/[^\w-]/g, "");
    return cleanDigits || "202688";
  };

  const startDemoAnalysis = React.useCallback((input: string): AnalysisTask => {
    const uid = parseUidFromInput(input);
    const now = new Date();
    const timeString = now.toLocaleString("zh-CN", { hour12: false });

    // New task starts in COLLECT with outcome: NONE
    const newTask: AnalysisTask = {
      id: `task-mock-${Date.now()}`,
      targetId: `target-mock-${uid}`,
      targetName: `演示目标 (${uid})`,
      platformUid: uid,
      taskStatus: "RUNNING",
      pipelineStage: "COLLECT",
      outcome: "NONE",
      progress: 11,
      currentStageMessage: "正在收集演示公开数据样本 (阶段 1/9: COLLECT)...",
      createdAt: timeString,
      dataSourceRuns: [
        {
          id: `ds-mock-01-${Date.now()}`,
          taskId: `task-mock-${Date.now()}`,
          sourceName: "演示基础公开资料",
          status: "SUCCEEDED",
          recordsCount: 1,
          durationMs: 120,
        },
      ],
    };

    setCurrentTask(newTask);
    setIsReportPurged(false);
    return newTask;
  }, []);

  const advanceStage = React.useCallback(() => {
    setCurrentTask((prev) => {
      if (!prev) return MOCK_INITIAL_TASK;

      const currentIndex = PIPELINE_STAGES_CONFIG.findIndex(
        (cfg) => cfg.stage === prev.pipelineStage
      );

      if (currentIndex < 0 || currentIndex >= PIPELINE_STAGES_CONFIG.length - 1) {
        // Already at final stage
        return {
          ...prev,
          taskStatus: "COMPLETED",
          pipelineStage: "REPORT",
          outcome: "FULL",
          progress: 100,
          currentStageMessage: "演示流水线全部 9 个阶段模拟完成，已生成模拟视图。",
          completedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        };
      }

      const nextCfg = PIPELINE_STAGES_CONFIG[currentIndex + 1];
      const nextProgress = Math.round(((currentIndex + 2) / PIPELINE_STAGES_CONFIG.length) * 100);
      const isFinal = currentIndex + 1 === PIPELINE_STAGES_CONFIG.length - 1;

      return {
        ...prev,
        taskStatus: isFinal ? "COMPLETED" : "RUNNING",
        pipelineStage: nextCfg.stage,
        outcome: isFinal ? "FULL" : "NONE",
        progress: nextProgress,
        currentStageMessage: `正在执行：${nextCfg.name} (阶段 ${nextCfg.stepNumber}/9: ${nextCfg.stage})...`,
        completedAt: isFinal ? new Date().toLocaleString("zh-CN", { hour12: false }) : undefined,
      };
    });
  }, []);

  const completeAllStages = React.useCallback(() => {
    setCurrentTask((prev) => {
      if (!prev) return MOCK_INITIAL_TASK;
      return {
        ...prev,
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        outcome: "FULL",
        progress: 100,
        currentStageMessage: "演示流水线全部 9 个阶段模拟完成，已生成模拟视图。",
        completedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      };
    });
  }, []);

  const resetDemoTask = React.useCallback(() => {
    setCurrentTask({
      ...MOCK_INITIAL_TASK,
      outcome: "NONE",
      id: `task-mock-${Date.now()}`,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    });
    setSelfProfile({
      ...MOCK_SELF_PROFILE,
    });
    setIsReportPurged(false);
  }, []);

  const setStage = React.useCallback((stage: PipelineStage) => {
    setCurrentTask((prev) => {
      if (!prev) return MOCK_INITIAL_TASK;
      const stageCfg = PIPELINE_STAGES_CONFIG.find((cfg) => cfg.stage === stage);
      const stepNumber = stageCfg?.stepNumber || 1;
      const progress = Math.round((stepNumber / PIPELINE_STAGES_CONFIG.length) * 100);
      const isFinal = stage === "REPORT";

      return {
        ...prev,
        pipelineStage: stage,
        taskStatus: isFinal ? "COMPLETED" : "RUNNING",
        outcome: isFinal ? "FULL" : "NONE",
        progress,
        currentStageMessage: `正在执行：${stageCfg?.name || stage} (阶段 ${stepNumber}/9: ${stage})...`,
        completedAt: isFinal ? new Date().toLocaleString("zh-CN", { hour12: false }) : undefined,
      };
    });
  }, []);

  const updateSelfProfile = React.useCallback((profile: SelfProvidedProfile) => {
    setSelfProfile(profile);
  }, []);

  const revokeSelfProfileConsent = React.useCallback(() => {
    // Revoke future consent for all fields: only affects future tasks, historical report remains valid
    setSelfProfile((prev) => ({
      ...prev,
      currentGoals: { ...prev.currentGoals, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
      learningDirections: { ...prev.learningDirections, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
      careerOrMajor: { ...prev.careerOrMajor, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
      interestTags: { ...prev.interestTags, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
      questionsForAnalysis: { ...prev.questionsForAnalysis, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
      additionalContext: { ...prev.additionalContext, consentScope: "THIS_TASK_ONLY" as ConsentScope, allowedForAnalysis: false },
    }));
  }, []);

  const purgeSelfProfileAndDerivedData = React.useCallback(() => {
    // Purge: physically clear self-profile fields and invalidate the current report
    setSelfProfile({
      id: "self-profile-empty",
      targetId: "target-demo-01",
      currentGoals: { value: "", allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      learningDirections: { value: [], allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      careerOrMajor: { value: "", allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      interestTags: { value: [], allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      questionsForAnalysis: { value: [], allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      additionalContext: { value: "", allowedForAnalysis: false, consentScope: "THIS_TASK_ONLY" },
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    });
    setIsReportPurged(true);
  }, []);

  const value = React.useMemo(
    () => ({
      currentTask,
      selfProfile,
      isReportPurged,
      demoTarget: MOCK_TARGET,
      demoTopicTaxonomy: MOCK_TOPIC_TAXONOMY,
      demoFollowEntities: MOCK_FOLLOW_ENTITIES,
      startDemoAnalysis,
      advanceStage,
      completeAllStages,
      resetDemoTask,
      setStage,
      updateSelfProfile,
      revokeSelfProfileConsent,
      purgeSelfProfileAndDerivedData,
    }),
    [
      currentTask,
      selfProfile,
      isReportPurged,
      startDemoAnalysis,
      advanceStage,
      completeAllStages,
      resetDemoTask,
      setStage,
      updateSelfProfile,
      revokeSelfProfileConsent,
      purgeSelfProfileAndDerivedData,
    ]
  );

  return <MockTaskContext.Provider value={value}>{children}</MockTaskContext.Provider>;
}

export function useMockTask() {
  const context = React.useContext(MockTaskContext);
  if (!context) {
    throw new Error("useMockTask must be used within a MockTaskProvider");
  }
  return context;
}
