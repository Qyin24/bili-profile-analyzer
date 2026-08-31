# Phase 4.8 — 专用受控证据工具规范与离线自测报告

---

## 1. 工具定位与设计目的

本工具（[`scripts/probes/phase4-8-evidence-collector.ts`](file:///c:/Users/Qyin/Desktop/应用中心/学习/分析目标/scripts/probes/phase4-8-evidence-collector.ts)）是专为 **Phase 4.8 准入证据收集** 构建的单用途受控执行引擎。

### 核心定位与隔离承诺
1. **单一能力限定**：**严格仅支持 `BASIC_PROFILE`**。若请求 `PUBLIC_FOLLOWS` 或 `PUBLIC_CONTENT`，探针在创建任何网络连接前直接拒绝（`errorCategory: "BLOCKED"`），网络请求数严格恒为 0；
2. **与生产环境绝对隔离**：工具仅位于 `scripts/probes/`，严禁在生产运行时（`src/`）中被引用或调用；
3. **能力状态不可变性**：工具的开发与自测不修改任何能力状态，全局三项能力（`BASIC_PROFILE`、`PUBLIC_FOLLOWS`、`PUBLIC_CONTENT`）严格恒为 `UNVERIFIED`。

---

## 2. 8 重严格前置执行门控 (8-Fold Execution Gates)

未来任何一次受控真实执行，必须**同时满足以下全部 8 项条件**；任一条件不满足，工具立即安全终止，外部网络请求数严格为 0：

```
                        [ 启动受控证据采集 ]
                                │
  1. 非生产环境? ───────────── NO ──▶ ❌ 终止 (0 网络请求)
        │ YES
  2. 能力为 BASIC_PROFILE? ─── NO ──▶ ❌ 终止 (0 网络请求)
        │ YES
  3. --allow-network? ──────── NO ──▶ ❌ 终止 (0 网络请求)
        │ YES
  4. 双确认环境变量生效? ───── NO ──▶ ❌ 终止 (0 网络请求)
     (FIELD_VALIDATION & OWNER_AUTHORIZED)
        │ YES
  5. 所有者逐次显式授权? ───── NO ──▶ ❌ 终止 (0 网络请求)
     (--owner-authorized)
        │ YES
  6. 独立样本/窗口确认? ────── NO ──▶ ❌ 终止 (0 网络请求)
     (--confirm-independent-sample)
        │ YES
  7. 距上次请求 >= 30 分钟? ── NO ──▶ ❌ 终止 (0 网络请求)
        │ YES
  8. 纯数字 UID 与域名白名单? ─ NO ──▶ ❌ 终止 (0 网络请求)
        │ YES
        ▼
   [ 执行恰好 1 次受控流式请求 (<= 64 KiB, <= 2048 chars) ]
```

| 门控序号 | 门控名称 | 验证规则 | 失败行为 |
| :--- | :--- | :--- | :--- |
| **Gate 1** | 环境安全检查 | `NODE_ENV !== "production"` | 立即终止，`fetchCallCount: 0` |
| **Gate 2** | 能力范围白名单 | `capability === "BASIC_PROFILE"` | 立即终止，`fetchCallCount: 0` |
| **Gate 3** | 网络显式开关 | 必须携带 `--allow-network` CLI 参数 | 立即终止，`fetchCallCount: 0` |
| **Gate 4** | 环境变量双确认 | `BILIPROFILE_FIELD_VALIDATION_ENABLED=true` 且 `BILIPROFILE_OWNER_AUTHORIZED=true` | 立即终止，`fetchCallCount: 0` |
| **Gate 5** | 所有者逐次授权 | 必须携带 `--owner-authorized` CLI 参数 | 立即终止，`fetchCallCount: 0` |
| **Gate 6** | 独立样本规则 | 必须携带 `--confirm-independent-sample` 或 `--sample-window <id>` | 立即终止，`fetchCallCount: 0` |
| **Gate 7** | 频次与间隔约束 | 距上一次受控请求时间戳必须 $\ge 30$ 分钟 ($1,800,000\text{ ms}$) | 立即终止，`fetchCallCount: 0` |
| **Gate 8** | UID 格式与 URL 白名单 | UID 必须为非空纯数字字符串（`/^\d+$/`），严格匹配 `https://space.bilibili.com/<UID>` | 立即终止，`fetchCallCount: 0` |

---

## 3. 单次执行技术与隐私硬上限 (Technical & Privacy Constraints)

1. **单次顺序请求**：单次命令最多执行 1 次请求，无重试、无并发、无分页、无批量；
2. **零凭据依赖**：`credentials: "omit"`，绝不发送 Cookie、Token、Authorization 或 SESSDATA；
3. **禁止跟随重定向**：`redirect: "manual"`，遇 3xx 重定向直接返回 `errorCategory: "REDIRECTED"`，绝不发起二次请求；
4. **流式安全截断**：流式读取硬上限 $\le 64\text{ KiB}$ ($65,536\text{ 字节}$)，滑动窗口内存峰值严格 $\le 2048\text{ 字符}$；
5. **脱敏状态输出**：仅对 `displayName`、`avatarUrl`、`signature` 输出脱敏校验状态（`PARSED_NONEMPTY`、`PARSED_EMPTY_OR_ABSENT`、`PARSE_REJECTED`、`NOT_OBSERVED`）；
6. **零敏感数据落盘**：`CapabilityEvidenceRecord` 严禁记录真实 UID、URL、字段原值、字段哈希、HTML 正文、响应头或操作者身份。

---

## 4. 证据模型定义 (`CapabilityEvidenceRecord`)

```typescript
export interface CapabilityEvidenceRecord {
  evidenceId: string; // 不可逆匿名随机标识 (如 evidence-rec-a1b2c3)
  capability: "BASIC_PROFILE";
  verifiedAt: string; // 严格 ISO 8601
  probeVersion: string;
  contractVersion: string;
  requestCount: 1;
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
  errorCategory: "NONE" | "REDIRECTED" | "RATE_LIMITED" | "BLOCKED" | "NON_HTML" | "BYTE_LIMIT_EXCEEDED" | "CONTRACT_REJECTED" | "NETWORK_ERROR" | "INVALID_GATING";
  transportOutcome: {
    isReachable: boolean;
    httpStatus: number;
    contentType: string;
    noRedirect: boolean;
    noRateLimit: boolean;
  };
  streamSecurity: {
    bytesProcessed: number;
    hitByteLimit: boolean;
    maxBufferObserved: number;
  };
  fieldStatus: {
    displayName: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
    avatarUrl: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
    avatarUrlSyntaxValid: boolean;
    signature: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
  };
  dataMinimizationGuaranteed: true;
  authorization: {
    authorizationType: "OWNER_EXPLICIT_PER_RUN";
    authorizationConfirmed: true;
  };
}
```

---

## 5. 纯离线自测验证说明

测试脚本 [`scripts/probes/phase4-8-evidence-collector-self-test.ts`](file:///c:/Users/Qyin/Desktop/应用中心/学习/分析目标/scripts/probes/phase4-8-evidence-collector-self-test.ts) 包含 6 个核心模块，覆盖所有门控与安全约束：

- **模块 1**：8 项前置门控测试（缺少任一参数时网络调用数恒为 0，不足 30 分钟拦截）；
- **模块 2**：能力范围隔离测试（`PUBLIC_FOLLOWS` 与 `PUBLIC_CONTENT` 拦截为 `BLOCKED` 且 0 网络调用）；
- **模块 3**：传输层异常分类测试（302 不跟随、429 限流、403 阻断、非 HTML 拦截）；
- **模块 4**：64 KiB 流式截断与准入结果判定（`SUCCESS`、`PARTIAL`、`FAILED`）；
- **模块 5**：`CapabilityEvidenceRecord` 数据最小化与防泄露审计；
- **模块 6**：生产 Connector 三项能力状态不可变性断言（恒为 `UNVERIFIED`）。
