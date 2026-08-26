# Phase 4.0 ~ 4.3.1 — 公开数据能力验证与门控架构报告 (Capability Verification Report)

> **文档目的**：记录 BiliProfile Analyzer 在 Phase 4.0 ~ Phase 4.3.1 阶段对 Bilibili 公开数据访问能力的基线评估、不可突破的流式安全不变量与能力门控（Capability-Gated）连接器架构。
> 
> **合规红线与安全约束**：
> 1. **严禁凭证与登录**：严禁使用任何 Cookie、SESSDATA、Token、Wbi、Authorization 请求头或认证绕过方案。
> 2. **严禁批量与自动化探测**：严禁使用自动化爬虫框架（如 Puppeteer/Playwright 批量抓取）、严禁并发重试轰炸。
> 3. **最小化信息留存**：本报告仅记录能力状态判定、HTTP 状态码与降级策略；**严禁记录任何真实 UID、完整目标 URL、响应正文文本、Cookie 或敏感请求头**。
> 4. **未验证不可用原则**：任何标记为 `UNVERIFIED`、`BLOCKED` 或 `UNSUPPORTED` 的能力，一律不得在正式 Connector 中调用，且严禁尝试绕过限制。
> 5. **PAGE_REACHABLE 与 TITLE_SIGNAL 语义边界**：
>    - **`PAGE_REACHABLE` 仅代表公开页面网络可达（HTTP 200）**；
>    - **`TITLE_SIGNAL_OBSERVED` 仅代表流式检测到 HTML 前部存在 `<title>` 闭合标签信号**；
>    - **两者均不是数据字段可用性、可提取性或真实资料身份的验证结果**；
>    - **探针行为准确边界**：仅短暂检查有限字节内（≤64 KiB）是否存在 `<title>` 标签闭合信号；**不提取、不保留、不输出 `<title>` 内容**。
> 6. **AVAILABLE_PUBLIC 语义边界**：
>    - **`AVAILABLE_PUBLIC` 仅代表未来可进入受控实现的能力架构状态，绝不等于当前已有提取实现**；
>    - 当前阶段所有 Connector 调用均不会发起请求、**绝不生成真实或伪造的成功资料（一律返回 `data: null` 与 `IMPLEMENTATION_NOT_AVAILABLE`）**。

---

## 📊 能力验证清单 (Capability Status Matrix)

| 能力标识 | 能力名称 | 验证方式 | 页面状态 | 字段信号 | 当前能力判定 | 门控状态 | 降级容错策略 | 最后验证时间 | 备注说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`BASIC_PROFILE`** | 公开基础展示信息 | 受控流式最小信号探测 (严格 ≤64 KiB 截断 + 2048 字符滑动窗口) | `PAGE_REACHABLE` (HTTP 200) | `TITLE_SIGNAL_OBSERVED` (发现最小 title 信号) | `UNVERIFIED` | 🔒 **严格拦截** (UNVERIFIED_BLOCKED) | 降级为默认占位展示名称（如：用户 UID）及通用头像 | 2026-08-26 10:33:18 | **受控流式验证完成**：仅短暂检查有限字节内是否存在 title 标签闭合信号；不提取、不保留、不输出 title 内容；**具体资料字段提取能力仍严格保持 UNVERIFIED，门控默认拦截** |
| **`PUBLIC_FOLLOWS`** | 公开关注列表 | 待验证 | - | `NOT_ATTEMPTED` | `UNVERIFIED` | 🔒 **严格拦截** (UNVERIFIED_BLOCKED) | 标记为 `SKIPPED_UNAVAILABLE`，触发降级模式，仅依赖自述与公开动态生成 | 尚未执行受控验证 | 严格保持 UNVERIFIED，门控默认拦截 |
| **`PUBLIC_CONTENT`** | 公开动态或投稿内容 | 待验证 | - | `NOT_ATTEMPTED` | `UNVERIFIED` | 🔒 **严格拦截** (UNVERIFIED_BLOCKED) | 跳过时段特征分析，报告中明确标注无动态样本 | 尚未执行受控验证 | 严格保持 UNVERIFIED，门控默认拦截 |

---

## 🛡️ Phase 4.3.1 能力门控与不变量架构 (Capability-Gated Architecture)

```
[ 上层调用 / Task 流水线 ]
         │
         ▼
[ BilibiliPublicConnector ]
         │
         ├─► 读取目标能力状态 (getCapabilityStatus)
         │
         ├───► 若状态 != 'AVAILABLE_PUBLIC' (如 UNVERIFIED, PAGE_REACHABLE, BLOCKED, 等)
         │         │
         │         └─► 🚨 立即拦截并返回 UNVERIFIED_BLOCKED (success: false, data: null)
         │             (零网络请求，不创建 fetch，不进入实现分支)
         │
         └───► 若状态 == 'AVAILABLE_PUBLIC' (未来需经严格受控审批并验证)
                   │
                   └─► 🛡️ 严格返回 IMPLEMENTATION_NOT_AVAILABLE (success: false, data: null)
                       (绝不伪造成功数据，零网络请求)
```

### 核心安全不变量：
1. **流式参数安全硬上限**：`MAX_BYTES_CAP` (64 KiB) 与 `MAX_WINDOW_CHARS` (2048) 是代码级不可突破硬顶，任何传入的非法或超大参数均被强钳至安全上限；
2. **代码级硬拦截与零伪造**：`fetchBasicProfile`、`fetchPublicFollows`、`fetchPublicContent` 在执行前强制检查注册表状态，且在没有真实提取实现前**绝不返回 success: true 或伪造数据**；
3. **PAGE_REACHABLE 绝不放行**：探针的 HTTP 200 仅代表网络可达，绝不解除字段提取门控；
4. **零网络调用保障**：所有 Connector 离线自检中，底层 Fake fetch 调用次数严格恒为 0。

---

## 🔍 能力与字段信号定义说明 (Status Definitions)

### 1. 页面与连接状态
- **`UNVERIFIED`**：尚未在受控测试链接上执行过探针验证（默认安全基线）。
- **`PAGE_REACHABLE`**：单次公开 HTTP GET 请求返回 200，仅代表页面网络可达；**不代表任何具体数据字段已被验证为可读取**。
- **`AVAILABLE_PUBLIC`**：仅用于未来在受控批准下、实际验证到最小公开数据字段可完整免密读取时使用；**当前阶段不等于已有提取实现**。
- **`UNAVAILABLE_PRIVATE`**：目标用户已将该项数据明确设置为私密，系统应正常执行跳过与降级策略。
- **`UNAVAILABLE_UNKNOWN`**：目标页面返回 HTTP 404 或无法确定是否私密。
- **`REDIRECTED_NOT_FOLLOWED`**：收到 HTTP 3xx 重定向响应；探针按规范不跟随跳转，绝不发起二次请求。
- **`RATE_LIMITED`**：触发访问频率限制（HTTP 429），探针立即终止，绝不重试。
- **`BLOCKED`**：遇到权限限制、403/412 防护或安全机制，探针立即停止，严禁规避。
- **`NETWORK_ERROR`**：网络连接超时或底层异常，探针已安全中断。
- **`UNSUPPORTED`**：平台未提供对应的公开访问途径或返回其他未识别 HTTP 状态。
- **`SKIPPED_NOT_CONFIGURED`**：未配置测试环境变量，探针主动跳过，绝不发起外部请求。
- **`SKIPPED_INVALID_CONFIGURATION`**：URL 格式不符合严格受控规范（非 `https://space.bilibili.com/<纯数字UID>`），探针主动跳过。

### 2. 字段信号状态 (Field Signal Status)
- **`NOT_ATTEMPTED`**：未尝试检测或前置条件未满足。
- **`TITLE_SIGNAL_OBSERVED`**：在 64 KiB 严格安全上限与 2048 字符滑动窗口内检测到闭合 `<title>` 标签信号（不提取、不保留、不输出具体内容）。
- **`TITLE_SIGNAL_NOT_OBSERVED`**：在 64 KiB 阈值内未检测到闭合 `<title>` 标签信号。

---

## 🛠️ 探针执行与自检命令集

| 命令 | 作用 | 网络行为 |
| :--- | :--- | :--- |
| `npm run probe:bilibili` | 基础页面网络可达性验证 | 仅在显式配有合规 URL 时发起单次 HTTP GET，绝不读取 body |
| `npm run probe:bilibili:field` | 最小字段信号验证 | 双重环境变量门禁下单次流式检测，≤64 KiB 熔断 |
| `npm run probe:bilibili:self-test` | 流式内存截断与参数钳制自检 | **纯离线运行，零网络请求** |
| `npm run probe:connector:self-test` | 能力门控 Connector 拦截与零伪造自检 | **纯离线运行，Spy 保证网络请求次数恒为 0** |
