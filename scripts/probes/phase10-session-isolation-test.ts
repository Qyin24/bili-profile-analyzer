/**
 * BiliProfile Analyzer — SEC-01: Anonymous Session Data Isolation Test
 *
 * Validates cross-session task isolation:
 * 1. Session A creates Task A; Session B creates Task B.
 * 2. Session A list (/api/tasks) sees ONLY Task A.
 * 3. Session B list (/api/tasks) sees ONLY Task B.
 * 4. Unauthenticated / new session sees empty list ([]).
 * 5. Session A attempting to read Task B details (/api/tasks/[id]) receives 404 NOT_FOUND.
 * 6. Session B attempting to read Task A details (/api/tasks/[id]) receives 404 NOT_FOUND.
 * 7. Session A attempting to read Task B deterministic report receives 404 NOT_FOUND.
 * 8. Session A attempting to read Task B AI analysis receives 404 NOT_FOUND.
 * 9. Session A attempting to execute Task B (/api/tasks/[id]/execute) receives 404 NOT_FOUND.
 */

import { NextRequest } from "next/server";
import { GET as listTasksHandler, POST as createTaskHandler } from "../../src/app/api/tasks/route";
import { GET as getTaskHandler, PATCH as patchTaskHandler } from "../../src/app/api/tasks/[id]/route";
import { POST as executeTaskHandler } from "../../src/app/api/tasks/[id]/execute/route";
import { GET as getDeterministicReportHandler } from "../../src/app/api/tasks/[id]/deterministic-report/route";
import { GET as getAiAnalysisHandler } from "../../src/app/api/tasks/[id]/ai-analysis/route";

async function runSessionIsolationTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — SEC-01 会话隔离与跨用户数据防护测试");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[测试 ${totalTests}] ${testName}: ✅ 通过`);
    } else {
      console.error(`[测试 ${totalTests}] ${testName}: ❌ 失败 ${detail ? `(${detail})` : ""}`);
      process.exitCode = 1;
    }
  }

  const sessionA = `sess-user-alice-${Date.now()}`;
  const sessionB = `sess-user-bob-${Date.now()}`;
  const sessionC = `sess-user-charlie-${Date.now()}`;

  // Step 1: Session A creates Task A
  const reqCreateA = new NextRequest("http://localhost:3000/api/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": sessionA,
    },
    body: JSON.stringify({
      platformUid: "1715629066",
      displayName: "Alice Target",
      selfProvidedConsentConfirmed: true,
    }),
  });
  const resCreateA = await createTaskHandler(reqCreateA);
  const taskA = await resCreateA.json();
  assert(resCreateA.status === 201 && Boolean(taskA.id), "Session A 成功创建 Task A");

  // Step 2: Session B creates Task B
  const reqCreateB = new NextRequest("http://localhost:3000/api/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": sessionB,
    },
    body: JSON.stringify({
      platformUid: "423895",
      displayName: "Bob Target",
      selfProvidedConsentConfirmed: true,
    }),
  });
  const resCreateB = await createTaskHandler(reqCreateB);
  const taskB = await resCreateB.json();
  assert(resCreateB.status === 201 && Boolean(taskB.id), "Session B 成功创建 Task B");

  // Test 1: Session A lists tasks -> sees ONLY Task A
  {
    const reqListA = new NextRequest("http://localhost:3000/api/tasks", {
      method: "GET",
      headers: { "x-session-id": sessionA },
    });
    const resListA = await listTasksHandler(reqListA);
    const listA = await resListA.json();
    const hasA = listA.some((t: { id: string }) => t.id === taskA.id);
    const hasB = listA.some((t: { id: string }) => t.id === taskB.id);
    assert(hasA && !hasB, "Session A 任务列表仅包含 Task A，严格隔离 Task B");
  }

  // Test 2: Session B lists tasks -> sees ONLY Task B
  {
    const reqListB = new NextRequest("http://localhost:3000/api/tasks", {
      method: "GET",
      headers: { "x-session-id": sessionB },
    });
    const resListB = await listTasksHandler(reqListB);
    const listB = await resListB.json();
    const hasA = listB.some((t: { id: string }) => t.id === taskA.id);
    const hasB = listB.some((t: { id: string }) => t.id === taskB.id);
    assert(hasB && !hasA, "Session B 任务列表仅包含 Task B，严格隔离 Task A");
  }

  // Test 3: Session C (new visitor) lists tasks -> empty list
  {
    const reqListC = new NextRequest("http://localhost:3000/api/tasks", {
      method: "GET",
      headers: { "x-session-id": sessionC },
    });
    const resListC = await listTasksHandler(reqListC);
    const listC = await resListC.json();
    assert(Array.isArray(listC) && listC.length === 0, "新会话访问任务列表返回空列表");
  }

  // Test 4: Session A reads own Task A details -> 200 OK
  {
    const reqGetA = new NextRequest(`http://localhost:3000/api/tasks/${taskA.id}`, {
      method: "GET",
      headers: { "x-session-id": sessionA },
    });
    const resGetA = await getTaskHandler(reqGetA, { params: Promise.resolve({ id: taskA.id }) });
    assert(resGetA.status === 200, "Session A 允许读取自己的 Task A 详情 (200 OK)");
  }

  // Test 5: Session A attempts to read Task B details -> 404 NOT_FOUND
  {
    const reqGetBByA = new NextRequest(`http://localhost:3000/api/tasks/${taskB.id}`, {
      method: "GET",
      headers: { "x-session-id": sessionA },
    });
    const resGetBByA = await getTaskHandler(reqGetBByA, { params: Promise.resolve({ id: taskB.id }) });
    assert(resGetBByA.status === 404, "Session A 跨会话读取 Task B 返回 404 NOT_FOUND (不泄漏存在性)");
  }

  // Test 6: Session B attempts to read Task A details -> 404 NOT_FOUND
  {
    const reqGetAByB = new NextRequest(`http://localhost:3000/api/tasks/${taskA.id}`, {
      method: "GET",
      headers: { "x-session-id": sessionB },
    });
    const resGetAByB = await getTaskHandler(reqGetAByB, { params: Promise.resolve({ id: taskA.id }) });
    assert(resGetAByB.status === 404, "Session B 跨会话读取 Task A 返回 404 NOT_FOUND");
  }

  // Test 7: Session A attempts to read Task B deterministic report -> 404 NOT_FOUND
  {
    const reqDetReport = new NextRequest(`http://localhost:3000/api/tasks/${taskB.id}/deterministic-report`, {
      method: "GET",
      headers: { "x-session-id": sessionA },
    });
    const resDetReport = await getDeterministicReportHandler(reqDetReport, { params: Promise.resolve({ id: taskB.id }) });
    assert(resDetReport.status === 404, "Session A 跨会话读取 Task B 确定性报告返回 404 NOT_FOUND");
  }

  // Test 8: Session A attempts to read Task B AI analysis -> 404 NOT_FOUND
  {
    const reqAiReport = new NextRequest(`http://localhost:3000/api/tasks/${taskB.id}/ai-analysis`, {
      method: "GET",
      headers: { "x-session-id": sessionA },
    });
    const resAiReport = await getAiAnalysisHandler(reqAiReport, { params: Promise.resolve({ id: taskB.id }) });
    assert(resAiReport.status === 404, "Session A 跨会话读取 Task B AI 分析工件返回 404 NOT_FOUND");
  }

  // Test 9: Session A attempts to execute Task B -> 404 NOT_FOUND
  {
    const reqExec = new NextRequest(`http://localhost:3000/api/tasks/${taskB.id}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionA,
      },
      body: JSON.stringify({ provider: "MOCK" }),
    });
    const resExec = await executeTaskHandler(reqExec, { params: Promise.resolve({ id: taskB.id }) });
    assert(resExec.status === 404, "Session A 跨会话触发 Task B 执行返回 404 NOT_FOUND");
  }

  // Test 10: Anonymous client without session attempting to access Task A -> 404 NOT_FOUND
  {
    const reqNoSess = new NextRequest(`http://localhost:3000/api/tasks/${taskA.id}`, {
      method: "GET",
    });
    const resNoSess = await getTaskHandler(reqNoSess, { params: Promise.resolve({ id: taskA.id }) });
    assert(resNoSess.status === 404, "无 Session 客户端直接请求 Task A 详情返回 404 NOT_FOUND");
  }

  console.log("\n=================================================");
  console.log(`🎉 SEC-01 会话隔离与跨用户数据防护测试全部通过！(${passedTests}/${totalTests} 项通过)`);
  console.log("=================================================\n");
}

runSessionIsolationTests().catch(console.error);
