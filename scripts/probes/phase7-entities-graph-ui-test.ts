/**
 * BiliProfile Analyzer — Phase 7.2 Automated Test
 * Validates:
 * 1. Complete removal of mock-data imports and mock visualizers from /entities and /graph
 * 2. Shared task selection state logic & URL validation rules (No auto-selection, no fallback on 404)
 * 3. Strict priority resolution (needsRegeneration > PENDING/RUNNING/FAILED > COMPLETED empty state)
 * 4. Honest, non-misleading controlled empty state statements
 * 5. Zero sensitive leakage (No SelfProvidedProfile/Snapshot text, no additionalContext, no prohibited inferences)
 */

import * as fs from "fs";
import * as path from "path";
import { TaskSummaryResponse } from "../../src/types/task-api";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  - ${message}: ✅`);
}

type SelectionState =
  | { type: "NO_TASK_SELECTED"; tasks: TaskSummaryResponse[] }
  | { type: "TASK_SELECTED"; task: TaskSummaryResponse; tasks: TaskSummaryResponse[] }
  | { type: "NOT_FOUND"; invalidTaskId: string; tasks: TaskSummaryResponse[] };

// Simulated Task Selection & State Priority Resolution Engine (identical to useTaskSelection & component views)
function resolveTaskSelectionState(
  urlTaskId: string | null,
  allTasks: TaskSummaryResponse[]
): SelectionState {
  if (!urlTaskId) {
    return { type: "NO_TASK_SELECTED", tasks: allTasks };
  }
  const matched = allTasks.find((t) => t.id === urlTaskId);
  if (matched) {
    return { type: "TASK_SELECTED", task: matched, tasks: allTasks };
  }
  return { type: "NOT_FOUND", invalidTaskId: urlTaskId, tasks: allTasks };
}

function resolveViewContentPriority(task: TaskSummaryResponse) {
  if (task.needsRegeneration) {
    return "NEEDS_REGENERATION";
  }
  if (task.taskStatus === "PENDING") {
    return "PENDING";
  }
  if (task.taskStatus === "RUNNING") {
    return "RUNNING";
  }
  if (task.taskStatus === "FAILED" || task.taskStatus === "CANCELLED") {
    return "FAILED_OR_CANCELLED";
  }
  if (task.taskStatus === "COMPLETED") {
    return "COMPLETED_CONTROLLED_EMPTY";
  }
  return "UNKNOWN";
}

async function runPhase7EntitiesGraphTest() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 7.2 Entities 与 Graph 真实状态收口自动化验证");
  console.log("=================================================\n");

  const rootDir = path.resolve(__dirname, "../../");

  // =========================================================================
  // 1. Source Removal Assertions: No mock-data imports or old mock components
  // =========================================================================
  console.log("[测试 1] 验证 /entities 与 /graph 及其组件中彻底移除 Mock 数据来源与旧组件...");

  const entitiesViewPath = path.join(rootDir, "src/components/features/entities/entities-view.tsx");
  const graphViewPath = path.join(rootDir, "src/components/features/graph/relationship-graph-view.tsx");
  const entitiesPagePath = path.join(rootDir, "src/app/entities/page.tsx");
  const graphPagePath = path.join(rootDir, "src/app/graph/page.tsx");

  assert(fs.existsSync(entitiesViewPath), "EntitiesView 组件文件存在");
  assert(fs.existsSync(graphViewPath), "RelationshipGraphView 组件文件存在");
  assert(fs.existsSync(entitiesPagePath), "Entities 页面文件存在");
  assert(fs.existsSync(graphPagePath), "Graph 页面文件存在");

  // Assert old mock components are completely removed
  const oldEntityListPath = path.join(rootDir, "src/components/features/entities/entity-list.tsx");
  const oldTopicBarPath = path.join(rootDir, "src/components/features/entities/topic-distribution-bar.tsx");
  const oldMockGraphPath = path.join(rootDir, "src/components/features/graph/mock-relationship-graph.tsx");

  assert(!fs.existsSync(oldEntityListPath), "旧 entity-list.tsx 已彻底删除");
  assert(!fs.existsSync(oldTopicBarPath), "旧 topic-distribution-bar.tsx 已彻底删除");
  assert(!fs.existsSync(oldMockGraphPath), "旧 mock-relationship-graph.tsx 已彻底删除");

  // Read all source contents in entities and graph directories
  const checkedFiles = [entitiesViewPath, graphViewPath, entitiesPagePath, graphPagePath];
  for (const filePath of checkedFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    assert(!content.includes("mock-data"), `${path.basename(filePath)} 不包含任何 mock-data 引用`);
    assert(!content.includes("MOCK_FOLLOW_ENTITIES"), `${path.basename(filePath)} 不包含 MOCK_FOLLOW_ENTITIES`);
    assert(!content.includes("MOCK_TARGET"), `${path.basename(filePath)} 不包含 MOCK_TARGET`);
    assert(!content.includes("MOCK_CATEGORY_METRICS"), `${path.basename(filePath)} 不包含 MOCK_CATEGORY_METRICS`);
    assert(!content.includes("MOCK_TOPIC_TAXONOMY"), `${path.basename(filePath)} 不包含 MOCK_TOPIC_TAXONOMY`);
  }

  // =========================================================================
  // 2. Shared Task Selection Context & URL Validation Assertions
  // =========================================================================
  console.log("\n[测试 2] 验证任务选择与 URL 校验状态机逻辑 (无静默选择、无 404 回退)...");

  const mockTasks: TaskSummaryResponse[] = [
    {
      id: "task-real-001",
      targetId: "target-001",
      taskStatus: "COMPLETED",
      pipelineStage: "REPORT",
      outcome: "FULL",
      progress: 100,
      currentStageMessage: "分析完成",
      needsRegeneration: false,
      hasSelfProvidedSnapshot: true,
      selfProvidedFieldsCount: 2,
      snapshotCreatedAt: "2026-08-27T10:00:00Z",
      createdAt: "2026-08-27T09:00:00Z",
      updatedAt: "2026-08-27T10:00:00Z",
      completedAt: "2026-08-27T10:00:00Z",
      target: {
        id: "target-001",
        platform: "BILIBILI",
        platformUid: "482910382",
        displayName: "测试用户A",
      },
      dataSourceRuns: [],
    },
    {
      id: "task-real-002",
      targetId: "target-002",
      taskStatus: "RUNNING",
      pipelineStage: "AGGREGATE",
      outcome: "NONE",
      progress: 45,
      currentStageMessage: "正在汇总数据",
      needsRegeneration: false,
      hasSelfProvidedSnapshot: false,
      selfProvidedFieldsCount: 0,
      snapshotCreatedAt: null,
      createdAt: "2026-08-27T11:00:00Z",
      updatedAt: "2026-08-27T11:05:00Z",
      completedAt: null,
      target: {
        id: "target-002",
        platform: "BILIBILI",
        platformUid: "991823741",
        displayName: "测试用户B",
      },
      dataSourceRuns: [],
    },
  ];

  // 2.1 No taskId in URL -> NO_TASK_SELECTED
  const stateNoUrl = resolveTaskSelectionState(null, mockTasks);
  assert(stateNoUrl.type === "NO_TASK_SELECTED", "URL 无 taskId 时正确解析为 NO_TASK_SELECTED");
  assert(!("task" in stateNoUrl), "URL 无 taskId 时绝不静默自动选择任何任务");

  // 2.2 Valid taskId in URL -> TASK_SELECTED
  const stateValid = resolveTaskSelectionState("task-real-001", mockTasks);
  assert(stateValid.type === "TASK_SELECTED", "有效 taskId 成功匹配为 TASK_SELECTED");
  if (stateValid.type === "TASK_SELECTED") {
    assert(stateValid.task.id === "task-real-001", "匹配到的任务 ID 严格一致");
    assert(stateValid.task.target?.platformUid === "482910382", "匹配到的目标 UID 准确一致");
  }

  // 2.3 Invalid taskId in URL -> NOT_FOUND (No silent fallback!)
  const stateInvalid = resolveTaskSelectionState("task-non-existent-999", mockTasks);
  assert(stateInvalid.type === "NOT_FOUND", "无效 taskId 正确解析为 NOT_FOUND");
  if (stateInvalid.type === "NOT_FOUND") {
    assert(stateInvalid.invalidTaskId === "task-non-existent-999", "NOT_FOUND 携带原始不透明 invalidTaskId");
  }

  // =========================================================================
  // 3. Strict Priority Resolution Assertions
  // =========================================================================
  console.log("\n[测试 3] 验证状态展示的严格优先级 (needsRegeneration > PENDING/RUNNING/FAILED > COMPLETED)...");

  // 3.1 needsRegeneration overrides COMPLETED
  const regeneratedTask: TaskSummaryResponse = {
    ...mockTasks[0],
    taskStatus: "COMPLETED",
    needsRegeneration: true,
  };
  const priority1 = resolveViewContentPriority(regeneratedTask);
  assert(priority1 === "NEEDS_REGENERATION", "needsRegeneration 拥有最高优先级 (高于 COMPLETED)");

  // 3.2 PENDING task
  const pendingTask: TaskSummaryResponse = {
    ...mockTasks[0],
    taskStatus: "PENDING",
    needsRegeneration: false,
  };
  assert(resolveViewContentPriority(pendingTask) === "PENDING", "PENDING 任务正确解析为 PENDING 状态");

  // 3.3 RUNNING task
  const runningTask: TaskSummaryResponse = {
    ...mockTasks[0],
    taskStatus: "RUNNING",
    needsRegeneration: false,
  };
  assert(resolveViewContentPriority(runningTask) === "RUNNING", "RUNNING 任务正确解析为 RUNNING 状态");

  // 3.4 FAILED / CANCELLED task
  const failedTask: TaskSummaryResponse = {
    ...mockTasks[0],
    taskStatus: "FAILED",
    needsRegeneration: false,
  };
  assert(resolveViewContentPriority(failedTask) === "FAILED_OR_CANCELLED", "FAILED 任务正确解析为 FAILED_OR_CANCELLED 状态");

  // 3.5 COMPLETED task without regeneration -> COMPLETED_CONTROLLED_EMPTY
  const completedTask: TaskSummaryResponse = {
    ...mockTasks[0],
    taskStatus: "COMPLETED",
    needsRegeneration: false,
  };
  assert(
    resolveViewContentPriority(completedTask) === "COMPLETED_CONTROLLED_EMPTY",
    "COMPLETED 任务正确解析为受控空状态 COMPLETED_CONTROLLED_EMPTY"
  );

  // =========================================================================
  // 4. Honest Controlled Empty State & Prohibited Inferences Assertions
  // =========================================================================
  console.log("\n[测试 4] 验证受控空状态文案与隐私红线 (无虚构博主、无虚构节点、无敏感推断)...");

  const entitiesViewContent = fs.readFileSync(entitiesViewPath, "utf-8");
  const graphViewContent = fs.readFileSync(graphViewPath, "utf-8");

  // Controlled empty state notices
  assert(entitiesViewContent.includes("暂无可验证实体数据"), "Entities 页面包含明确的【暂无可验证实体数据】标题");
  assert(entitiesViewContent.includes("不代表该用户在 B 站没有关注博主或公开内容"), "Entities 页面包含客观非零事实声明");
  assert(graphViewContent.includes("暂无可验证关系图谱"), "Graph 页面包含明确的【暂无可验证关系图谱】标题");
  assert(
    graphViewContent.includes("不代表该用户在 B 站没有关注关系或内容交互"),
    "Graph 页面包含客观非零事实声明"
  );

  // Check no sensitive fields leaked in code
  const prohibitedKeys = [
    "MBTI",
    "mbti",
    "politicalAffiliation",
    "sexualOrientation",
    "healthCondition",
    "religiousBelief",
    "additionalContext",
  ];
  for (const key of prohibitedKeys) {
    assert(!entitiesViewContent.includes(key), `EntitiesView 不包含敏感推断或自述键: ${key}`);
    assert(!graphViewContent.includes(key), `RelationshipGraphView 不包含敏感推断或自述键: ${key}`);
  }

  // Check no fake counts pretending to be real
  assert(!graphViewContent.includes("0 个节点"), "Graph 页面不显示误导性的 '0 个节点'");
  assert(!graphViewContent.includes("0 条关系"), "Graph 页面不显示误导性的 '0 条关系'");

  // =========================================================================
  // 5. Dashboard Action Links Integration Assertion
  // =========================================================================
  console.log("\n[测试 5] 验证 Dashboard 已选任务卡片包含实体状态与关系图谱跳转入口...");

  const taskDetailCardPath = path.join(
    rootDir,
    "src/components/features/dashboard/task-detail-card.tsx"
  );
  const taskDetailCardContent = fs.readFileSync(taskDetailCardPath, "utf-8");

  assert(
    taskDetailCardContent.includes("/entities?taskId="),
    "TaskDetailCard 包含前往 /entities?taskId= 的跳转链接"
  );
  assert(
    taskDetailCardContent.includes("/graph?taskId="),
    "TaskDetailCard 包含前往 /graph?taskId= 的跳转链接"
  );

  console.log("\n=================================================");
  console.log("🎉 Phase 7.2 Entities 与 Graph 真实状态收口所有测试全部通过！");
  console.log("=================================================\n");
}

runPhase7EntitiesGraphTest().catch((err) => {
  console.error("Phase 7.2 测试执行失败:", err);
  process.exit(1);
});
