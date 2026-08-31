# Phase 4.5 — 结构化公开资料字段契约与离线验证报告 (Field Contract & Offline Validation)

> **文档定位**：本文档定义 BiliProfile Analyzer 在未来“最小公开基础资料”采集方向上的数据契约、字段状态机、最低证据要求与离线验证基线。
> 
> **重要边界声明**：
> 1. **字段级“已验证”(VERIFIED) 与能力级“可稳定使用”(AVAILABLE_PUBLIC) 是两个完全不同的结论**。
> 2. **严禁混淆**：绝不得将“可看到名称相关标题信号”描述成“已经可以稳定采集昵称、头像、签名等资料”。
> 3. **本阶段非正式采集实现**：未接入真实采集管道，未将任何真实用户资料写入数据库、任务快照、Mock 报告或 UI。

---

## 1. 当前字段契约 (Public Profile Field Contract — Phase 4.5.1)

字段候选范围严格限制于以下 5 个最小公开基础字段：

| 字段名称 (`fieldName`) | 字段含义 | 允许值类型 (`value`) | 状态可区分联合 (`status`) | 结构化证据说明 (`evidence`) | 失败原因 (`failureReason`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`displayName`** | 用户公开展示名称 | `string` (非空、无控制字符、无 HTML 标签/尖括号) | `VERIFIED` / `UNVERIFIED` / `UNAVAILABLE` | `{ evidenceType, anchorIdentifier }`，当 `VERIFIED` 时必填且 `evidenceType !== 'NONE'`；当非 `VERIFIED` 时仅允许 `NONE` | 当 `UNVERIFIED` / `UNAVAILABLE` 时必填且非空、不含 HTML 标签 |
| **`signature`** | 用户个人签名/简介 | `string` (非空、无控制字符、无 HTML 标签/尖括号) | `VERIFIED` / `UNVERIFIED` / `UNAVAILABLE` | `{ evidenceType, anchorIdentifier }`，当 `VERIFIED` 时必填且 `evidenceType !== 'NONE'`；当非 `VERIFIED` 时仅允许 `NONE` | 当 `UNVERIFIED` / `UNAVAILABLE` 时必填且非空、不含 HTML 标签 |
| **`avatarUrl`** | 公开头像图片地址 | `string` (仅限 http/https/协议相对 URL、无凭据 user:pass、无尖括号/空格/控制字符) | `VERIFIED` / `UNVERIFIED` / `UNAVAILABLE` | `{ evidenceType, anchorIdentifier }`，当 `VERIFIED` 时必填且 `evidenceType !== 'NONE'`；当非 `VERIFIED` 时仅允许 `NONE` | 当 `UNVERIFIED` / `UNAVAILABLE` 时必填且非空、不含 HTML 标签 |
| **`verifiedLabel`** | 官方认证文字标识 | `string` (非空、无控制字符、无 HTML 标签/尖括号) | `VERIFIED` / `UNVERIFIED` / `UNAVAILABLE` | `{ evidenceType, anchorIdentifier }`，当 `VERIFIED` 时必填且 `evidenceType !== 'NONE'`；当非 `VERIFIED` 时仅允许 `NONE` | 当 `UNVERIFIED` / `UNAVAILABLE` 时必填且非空、不含 HTML 标签 |
| **`level`** | 公开账号等级 | `number` (0 ~ 6 整数) | `VERIFIED` / `UNVERIFIED` / `UNAVAILABLE` | `{ evidenceType, anchorIdentifier }`，当 `VERIFIED` 时必填且 `evidenceType !== 'NONE'`；当非 `VERIFIED` 时仅允许 `NONE` | 当 `UNVERIFIED` / `UNAVAILABLE` 时必填且非空、不含 HTML 标签 |

### 核心状态流转与可区分联合约束规则：
1. **`VERIFIED` 状态强绑定**：必须携带合法类型与范围的 `value`，必须携带结构化 `evidence`（`evidenceType` 必须为非 `NONE` 枚举，`anchorIdentifier` 非空且不含控制字符/HTML），`failureReason` 必须为空；
2. **`UNVERIFIED` / `UNAVAILABLE` 零值约束**：`value` 必须为空，`failureReason` 必须为非空且不含 HTML 标签的字符串，`evidence` 必须为空或 `{ evidenceType: "NONE", anchorIdentifier: "" }`；
3. **能力门控不变量**：`overallCapabilityStatus` 在类型系统与运行时中严格固定为字面量 `"UNVERIFIED"`；
4. **错误文本零敏感值回显**：所有校验与断言错误信息均使用静态通用描述，严禁插值拼接未可信输入或可能泄露的凭据内容；
5. **合成夹具独立隔离**：`evaluateSyntheticProfileFieldContract` 的 `source` 恒为 `"SYNTHETIC_OFFLINE_TEST"`，仅用于离线测试夹具，绝非生产环境资料提取入口。

---

## 2. 每个字段成为 `VERIFIED` 所需的最低证据

| 字段 | 最低证据要求 (Minimum Required Evidence) | 不足证据示例 (直接判定为 UNVERIFIED / UNAVAILABLE) |
| :--- | :--- | :--- |
| **`displayName`** | 必须命中明确的结构化元标签（如 `<meta property="og:title" content="...">`）或个人空间语义容器（如 `<h1 class="h-name">` / `<span id="h-name">`），且提取值非空、无 HTML 标签/尖括号、无控制字符。 | ❌ 普通页面 `<title>` 文本<br>❌ URL 路径猜测<br>❌ 正则偶然命中其他元素内的昵称 |
| **`signature`** | 必须命中描述元标签（如 `<meta name="description" content="...">`）或签名语义容器（如 `<div class="h-sign">` / `<span id="h-sign">`），且提取值非空、无 HTML 标签/尖括号、无控制字符。 | ❌ 页面正文随机文本猜测<br>❌ 动态内容截断推断 |
| **`avatarUrl`** | 必须命中图片元标签（如 `<meta property="og:image" content="...">`）或头像 DOM 结构（如 `<img class="h-avatar" src="...">`），且 URL 必须通过安全协议校验（仅限 `http://`、`https://` 或 `//`）、无 user:pass 认证信息、无尖括号/空格。 | ❌ 包含用户名密码（`https://user:pass@host/`）<br>❌ 非安全协议（如 `javascript:`、`data:`、`ftp:`）<br>❌ 包含控制字符、尖括号或空格<br>❌ 空 src 或占位默认图 |
| **`verifiedLabel`** | 必须命中官方认证文字特定语义标签（如 `<span class="h-verified-text">` / `<div class="user-auth-title">`），且非空、无 HTML 标签/尖括号。 | ❌ 徽标图标是否存在猜测<br>❌ 普通文本中的“认证”字样 |
| **`level`** | 必须命中具有明确属性的等级锚点（如 `<span class="h-level" data-level="6">`），数值必须在 0~6 之间的整数。 | ❌ CSS 类名猜测<br>❌ 无法确定数值的图标<br>❌ 浮点数、负数或大于 6 |

---

## 3. 当前实际已验证与未验证的内容

### 1. 实际已验证内容 (Offline Validated)
- **纯离线契约解析与校验器**（`scripts/probes/profile-field-contract.ts`）：
  - 覆盖全部 5 项字段的细粒度可区分联合、协议、范围与结构锚点识别与合法性校验；
  - 覆盖真实日历 ISO 8601 时间校验（准确拦截 2026-02-30 等非法日期）；
  - 覆盖非结构化标题文本拦截规则（普通 `<title>` 拒绝产生 `displayName`）；
  - 覆盖未验证字段禁带值、伪造证据拦截与 `VERIFIED` 字段双向强绑定约束；
  - 覆盖数据最小化与循环引用安全断言（递归深度限制、拦截任意 HTML 标签片段、零敏感数据残留、错误信息不回显敏感值）；
  - 覆盖能力状态不可变断言（`overallCapabilityStatus === "UNVERIFIED"` 字面量不变式）；
  - 13 项全量离线自动化测试全部通过（`npm run probe:field-contract:self-test`，外部网络调用数 = 0）。

### 2. 当前仍处于 `UNVERIFIED` 或 `UNAVAILABLE` 的内容及原因
- **整体能力 `BASIC_PROFILE`**：**`UNVERIFIED`**。本阶段仅验证离线契约不变量与结构锚点模型，绝不代表可稳定提取真实资料。
- **`displayName` / `signature` / `avatarUrl` 生产提取**：**`UNVERIFIED`**。生产 Connector 严格保持门控拦截（`data: null`, `UNVERIFIED_BLOCKED`）。
- **`verifiedLabel` / `level`**：**`UNAVAILABLE`**。公开页面初始流式窗口（≤64 KiB）内尚未建立稳定的结构锚点规范，当前阶段标记为不可用。
- **`PUBLIC_FOLLOWS` / `PUBLIC_CONTENT`**：**`UNVERIFIED`**。未开展真实页面验证，保持初始门控状态。

---

## 4. 不保存什么 (Data Minimization Strict Rules)

在任何字段契约评估、测试或日志中，**绝对严禁保存、打印或持久化以下内容**：
1. **原始 HTML / 响应正文**：不保留完整或大段 HTML 报文；
2. **凭据与会话信息**：绝不使用、提取或记录 Cookie、SESSDATA、buvid、token、Authorization；
3. **敏感请求头与环境变量**：不记录请求头、API Keys、数据库连接串；
4. **真实 UID 与用户真实信息**：离线测试仅使用合成夹具（Synthetic Fixtures），受控探针绝不持久化真实资料文本；
5. **推断与猜测值**：未验证字段必须为空，绝不使用模拟占位值冒充真实数据。

---

## 5. 后续进入正式采集前还缺少哪些验证

在未来考虑进入正式公开资料采集实现前，必须按顺序完成以下严格前置步骤：
1. **抗变动性与长期稳定性评估**：在多时间段、不同公开主页样本下验证结构锚点是否稳定存在且不被前端重构破坏；
2. **受限频率与反爬/风控边界测试**：在授权下实测无凭据公开请求的频控阈值与安全间隔，确保零风险；
3. **数据清洗与安全脱敏管道**：针对提取后的展示名称、签名建立完整的 XSS 防护与敏感字符过滤机制；
4. **正式 Connector 状态提升审批**：由项目所有者明确审查并批准将 `BASIC_PROFILE` 门控状态从 `UNVERIFIED` 调整为 `AVAILABLE_PUBLIC`；
5. **合规审计与隐私影响评估**：确保整个提取与展示链路严格遵循公开信息最小化原则，不推断、不跨库关联。

---

## 6. Phase 4.6.1 加固字段契约受控单次脱敏验证结论

- **单次请求边界**：本轮真实请求总数严格为 1，已执行完毕，已安全结束且不得重试。
- **离线检查结论**：前置字段契约自检、基础资料自检、类型检查与代码规范检查全部通过。
- **传输与流式安全**：
  - HTTP 结果类别：HTTP 200 可达；
  - 传输异常：未发生重定向、限流、拒绝访问、超时或非 HTML 响应；
  - 内容类型类别：HTML；
  - 实际处理字节数：7572 字节（判定结论：≤ 64 KiB 上限，滑动窗口 ≤ 2048 字符）。
- **字段脱敏校验状态**：
  - `displayName`: **PARSED_NONEMPTY**
  - `avatarUrl`: **PARSED_NONEMPTY**（安全 URL 语法校验通过）
  - `signature`: **PARSED_NONEMPTY**
- **数据最小化审计结论**：
  - 确认未在文档、日志或存储中保留任何 UID、请求 URL、字段原值、响应头或原始 HTML 正文；
  - 确认未保留任何 Cookie、Token、环境变量值或可逆标识。
- **全局能力状态不变量**：
  - `BASIC_PROFILE`、`PUBLIC_FOLLOWS`、`PUBLIC_CONTENT` 均严格保持 **`UNVERIFIED`**；
  - 生产连接器（Connector）持续保持门控拦截（`UNVERIFIED_BLOCKED`，`data: null`）；
  - 未写入数据库、任务快照、UI、Mock 报告或 AI；
  - 本次受控验证不是 Connector 放行，亦不是正式采集实现。

