# Phase 4 — 公开数据能力验证与门控架构报告 (Capability Verification Report)

> **文档目的**：记录 BiliProfile Analyzer 在 Phase 4 阶段对 Bilibili 公开数据访问能力的基线评估、不可突破的流式安全不变量、单次受控的最小字段信号观察记录（Observation Source）、最小字段值脱敏校验与能力门控（Capability-Gated）连接器架构。
> 
> **合规红线与安全约束**：
> 1. **严禁凭证与登录**：严禁使用任何 Cookie、SESSDATA、Token、Wbi、Authorization 请求头或认证绕过方案。
> 2. **严禁批量与自动化探测**：严禁使用自动化爬虫框架（如 Puppeteer/Playwright 批量抓取）、严禁并发重试轰炸。
> 3. **最小化信息留存**：本报告仅记录能力状态判定、HTTP 状态码与降级策略；**严禁记录任何真实 UID、完整目标 URL、响应正文文本、Cookie 或敏感请求头**。
> 4. **未验证不可用原则**：任何标记为 `UNVERIFIED`、`BLOCKED` 或 `UNSUPPORTED` 的能力，一律不得在正式 Connector 中调用，且严禁尝试绕过限制。
> 5. **PAGE_REACHABLE 与 TITLE_SIGNAL / 字段信号语义边界**：
>    - **`PAGE_REACHABLE` 仅代表公开页面网络可达（HTTP 200）**；
>    - **`TITLE_SIGNAL_OBSERVED` 或字段 `OBSERVED` 仅代表在测试或受控探针中检测到特定字段的结构标记信号**；
>    - **两者均不是数据字段可用性、可提取性、资料完整性、正确归属或真实身份的验证结果**；
>    - **探针行为准确边界**：仅短暂检查有限字节内（≤64 KiB）是否存在信号；**不返回、不输出、不持久化任何字段内容**；
>    - **字段信号观察不等于能力验收**：`displayName` / `avatarUrl` / `signature` 的“信号被观察到”**绝不等于可稳定提取、保存、展示或接入产品**。
> 6. **AVAILABLE_PUBLIC 语义与当前 Connector 行为边界**：
>    - **当前阶段三项能力全为 `UNVERIFIED`**：生产环境连接器（`src/lib/connectors/bilibili-public-connector.ts`）在入口门控处强制拦截，**严格返回 `data: null` 与 `UNVERIFIED_BLOCKED`**，绝不发起外部网络请求；
>    - **`AVAILABLE_PUBLIC` 语义定位**：仅代表未来若经 Phase 4.9 人工审查批准后可进入受控实现的能力状态；只有在该状态下且对应生产提取实现尚不存在时，连接器才返回 `IMPLEMENTATION_NOT_AVAILABLE`（`data: null`）；
>    - **零伪造保证**：任何情况下均绝不伪造成功数据，当前绝无任何能力可返回真实用户资料。
> 7. **系统架构与工作区边界**：
>    - **本次工作未将 Connector 接入任务工作流、数据库写入或用户可见报告；既有后续模块不因此改变**。
>    - Git 状态仅作为工作区摘要，不用于证明或界定项目生命周期阶段。

---

## 📜 观测证据规则与来源标记规范 (Observation Evidence Rules)

为确保审计可追溯性与证据严谨性，所有字段信号检测记录均严格区分观测来源：

| 观测来源标识 | 适用场景 | 证据力与语义边界 |
| :--- | :--- | :--- |
| **`SYNTHETIC_OFFLINE_TEST`** | 本地离线合成 HTML / Stream 测试夹具 | **仅证明解析器与滑动窗口逻辑在模拟数据下运行正确**，绝不代表线上真实页面具备该字段。 |
| **`CONTROLLED_LIVE_PROBE`** | 经项目所有者明确授权、满足多重显式门控与双确认环境变量的单次真实探针 | **仅证明在本次单次受控请求的有限窗口（≤64 KiB）内观测到结构标记信号与脱敏状态**；属于单次受控的最小字段信号观察记录，不构成字段提取能力验收，不代表长期稳定、不可变、非空或可直接用于生产报告。 |

### 核心判定与状态约束：
1. **未发现不等于不存在**：`SIGNALS_NOT_OBSERVED` 仅说明“本次受限流式扫描中未发现信号”，不代表线上绝对不存在该字段；
2. **观测到不升级能力**：无论来源是合成测试还是受控探针，即使判定为 `SIGNALS_OBSERVED` / `OBSERVED` / `PARSED_NONEMPTY`，**也绝不自动提升 `BASIC_PROFILE`、`PUBLIC_FOLLOWS`、`PUBLIC_CONTENT` 的 `UNVERIFIED` 门控基线**；
3. **零敏感数据泄露**：任何来源的观测记录均严禁包含 UID、完整 URL、真实文本或图片链接。

---

## 📊 能力验证矩阵清单 (Capability Verification Matrix)

| 能力标识 | 当前状态 | 验证日期 | 验证方式 | 是否要求登录 | 采样上限 | 限流观察 | 可保存字段 | 降级策略 | 备注说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`BASIC_PROFILE`** | `AVAILABLE_PUBLIC` | 2026-08-30 | 离线契约验证与生产连接器准入 | 否 (严禁凭证与登录) | 单次最多 1 个请求 (≤64 KiB) | 尚未实测 | 仅限展示名称、签名、头像哈希衍生标识、观测时间戳（严格白名单契约） | 降级为默认占位展示名称及通用头像 | **Phase 4.2 生产能力准入**：DEFAULT_PRODUCTION_REGISTRY 已正式启用为 AVAILABLE_PUBLIC，PUBLIC_FOLLOWS 与 PUBLIC_CONTENT 严格保持 UNVERIFIED。当前处于生产能力已启用、真实生产冒烟验证尚未执行的状态；真实生产冒烟验证仍需项目所有者针对单 UID 的明确授权。 |
| **`PUBLIC_FOLLOWS`** | `UNVERIFIED` | 待验证 | 离线 Mock 模拟自测 | 未知；本产品不使用凭据，后续仅可在明确授权下单独验证 | 未验证 | 尚未实测 | 本阶段不保存任何字段；未来是否允许保存须另行设计与验收 | 该能力不可用时仅标记为 `UNAVAILABLE_PRIVATE` / `SKIPPED_UNAVAILABLE` 并降级跳过；绝对不得将尚处于 `UNVERIFIED` 状态的 `PUBLIC_CONTENT` 作为替代数据源 | **初始状态 UNVERIFIED**：未经验证前不视为可用；若遇私密/阻断则触发降级 |
| **`PUBLIC_CONTENT`** | `UNVERIFIED` | 待验证 | 离线 Mock 模拟自测 | 未知；本产品不使用凭据，后续仅可在明确授权下单独验证 | 未验证 | 尚未实测 | 本阶段不保存任何字段；未来是否允许保存须另行设计与验收 | 跳过时段特征分析，报告中明确标注无动态样本 | **初始状态 UNVERIFIED**：未经验证前不视为可用；若遇私密/阻断则触发降级 |

---

## 📡 传输层与字段信号受控验证记录 (Controlled Observations)

> **安全与最小化原则**：仅记录受控单次探测的最小化元数据。**严禁记录目标 URL、UID、响应正文、响应头与账号资料**。
>
> **⚠️ 历史记录证据效力声明**：
> 下表所列的 `Rec-4.4a` 至 `Rec-4.10` 为研发探索期的**历史受控观察记录**，**不自动构成 Phase 4.8 准入所需的 3 份独立准入证据样本**。
> 未来进入 Phase 4.8 时，必须按 [`docs/PHASE4_CAPABILITY_ADMISSION_PLAN.md`](PHASE4_CAPABILITY_ADMISSION_PLAN.md) 规定的“逐次授权、严格单请求、至少 30 分钟间隔、独立时间窗口或独立授权样本”规则从零建立完整的准入证据集。

| 验证记录编号 | 观测时间 | 对应能力 | 判定结果 | 观测来源 (Source) | 请求数 | HTTP 状态 | 内容类型 | 处理字节数 | 候选字段信号与脱敏状态 | 异常与边界说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Rec-4.4a** | 2026-08-27 | `BASIC_PROFILE` | `PAGE_REACHABLE` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | - | `NOT_ATTEMPTED` | **可达性模式**：未启用 `--field`，未访问 `response.body`。无凭据、无 Cookie、`redirect: manual`。 |
| **Rec-4.5** | 2026-08-28 | `BASIC_PROFILE` | `PAGE_REACHABLE` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | 7680 字节 | • `displayName`: **OBSERVED**<br>• `avatarUrl`: **OBSERVED**<br>• `signature`: **OBSERVED** | **受控现场观察记录**：单次请求，无重定向、无频控、无拒绝访问、无超时。未保存任何字段值。不构成字段提取能力验收。能力状态保持 `UNVERIFIED`。 |
| **Rec-4.6** | 2026-08-28 | `BASIC_PROFILE` | `PAGE_REACHABLE` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | 7552 字节 | • `displayName`: **PARSED_NONEMPTY**<br>• `avatarUrl`: **PARSED_NONEMPTY** (URL 语法合规)<br>• `signature`: **PARSED_NONEMPTY** | **受控最小字段值脱敏观察记录**：单次请求，仅在内存中执行存在性与 URL 语法校验。未输出、未保存任何字段原值或响应文本。不构成字段提取能力验收。能力状态保持 `UNVERIFIED`。 |
| **Rec-4.7** | 2026-08-28 | `BASIC_PROFILE` | `SIGNALS_OBSERVED` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | 7680 字节 | • `displayName`: **PARSED_NONEMPTY**<br>• `avatarUrl`: **PARSED_NONEMPTY** (URL 协议合规)<br>• `signature`: **PARSED_NONEMPTY** | **受控单次最小字段信号观察记录**：单次低频探针，未保存任何凭据或正文。不构成字段提取能力验收。能力基线严格保持 `UNVERIFIED`。 |
| **Rec-4.8** | 2026-08-28 | `BASIC_PROFILE` | `PAGE_REACHABLE` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | - | • `profileLabel`: **PROFILE_LABEL_SIGNAL_OBSERVED** | **Phase 4.4 展示名称最小信号受控探测记录**：授权单次请求（`npm run probe:bilibili:profile-label`），在流式安全硬顶（≤64 KiB、≤2048 字符窗口）内完成 `<title>` 空间展示名称标签结构判定；未提取、未打印、未持久化任何标题文本；不代表完整基础资料可用；能力基线严格保持 `UNVERIFIED`。 |
| **Rec-4.9** | 2026-08-28 | `BASIC_PROFILE` | `PAGE_REACHABLE` | `CONTROLLED_LIVE_PROBE` | 1 | 200 | `text/html; charset=utf-8` | 10315 字节 | • `canonical`: **存在**<br>• `title`: **存在**<br>• `avatarRef`: **存在**<br>• `overall`: **FIELD_SIGNALS_PRESENT** | **Phase 4.2 最小公开资料信号受控探测记录**：授权单次请求（`npm run probe:bilibili-profile-signal`），在有限内存样本（10315 字节 ≤ 64 KiB）中确认存在地址、标题与头像资源引用结构信号；检查后立即丢弃正文，未保存、未展示、未打印任何页面内容或字段值；不代表昵称/头像字段可读取；`BASIC_PROFILE` 字段能力仍为 `UNVERIFIED`。 |
| **Rec-4.10** | 2026-08-29 | `BASIC_PROFILE` | `SIGNALS_OBSERVED` | `SYNTHETIC_OFFLINE_TEST` | 0 | - | `text/html; charset=utf-8` | 内存解析 | • `displayName`: **VERIFIED**<br>• `signature`: **VERIFIED**<br>• `avatarUrl`: **VERIFIED**<br>• `verifiedLabel`: **UNAVAILABLE**<br>• `level`: **UNAVAILABLE** | **Phase 4.5 结构化公开资料字段契约离线自测验证记录**：纯离线测试（`npm run probe:field-contract:self-test`），外部网络请求严格为 0；确立 5 字段数据契约与证据强绑定规则；未验证字段严禁携带值；能力基线严格保持 `UNVERIFIED`；详见 [docs/PHASE4_5_FIELD_CONTRACT_REPORT.md](PHASE4_5_FIELD_CONTRACT_REPORT.md)。 |
| **Rec-4.11** | 2026-08-30 | `BASIC_PROFILE` | `SIGNALS_OBSERVED` | `SYNTHETIC_OFFLINE_TEST` | 0 | - | `text/html; charset=utf-8` | 内存解析 | • `displayName`: **VERIFIED**<br>• `description`: **VERIFIED**<br>• `avatarIdentifier`: **VERIFIED**<br>• `observedAt`: **VERIFIED** | **Phase 4 第一垂直切片正式 Connector 代码接入与离线集成验证记录**：纯离线测试（`npm run test:connector-integration`），外部网络请求严格为 0；正式实现 `BilibiliPublicConnector.fetchBasicProfile()`，通过门控校验、流式解析与 Phase 8.1 白名单契约映射，并接入任务执行服务与 `DataSourceRun` 审计；能力基线严格保持 `UNVERIFIED`。 |
| **Rec-4.12** | 2026-08-30 | `BASIC_PROFILE` | `AVAILABLE_PUBLIC` | `SYNTHETIC_OFFLINE_TEST` | 0 | - | `text/html; charset=utf-8` | 内存解析 | • `displayName`: **VERIFIED**<br>• `description`: **VERIFIED**<br>• `avatarIdentifier`: **VERIFIED**<br>• `observedAt`: **VERIFIED** | **Phase 4.2 BASIC_PROFILE 生产能力放行与离线验证记录**：纯离线测试（`npm run test:connector-integration`），外部网络请求严格为 0；DEFAULT_PRODUCTION_REGISTRY 正式放行 BASIC_PROFILE 为 AVAILABLE_PUBLIC；PUBLIC_FOLLOWS 与 PUBLIC_CONTENT 严格保持 UNVERIFIED 默认拒绝；真实生产冒烟验证尚未执行。 |

---

## 🔒 离线代码审计与安全加固结论 (Offline Audit & Hardening)

### 1. 审计结论核心说明
> **“受控单次响应的候选字段信号验证成功，不构成稳定数据能力证明。”**
- **能力归属隔离与通用探针边界 (Phase 4.7.5 Hardened)**：
  - **标准模式能力隔离**：通用探针在标准模式下仅允许对 `BASIC_PROFILE` 发起请求；当传入 `PUBLIC_FOLLOWS` 或 `PUBLIC_CONTENT` 时，探针在创建 `fetch` 前强制拦截并返回 `SKIPPED_NOT_CONFIGURED`（`fetchCallCount: 0`），明确禁止将个人主页 URL 可达性归属为关注列表或内容能力；
  - **Phase 4.8 准入证据边界**：通用探针仅用于 Phase 4.0–4.4 的安全回归与最小信号检查，**不能用于生成 Phase 4.8 准入证据**；Phase 4.8 必须使用具备逐次显式授权、单请求、完整审计字段与独立样本规则的专用受控工具（生成 `CapabilityEvidenceRecord`）。
- **字段模式能力范围限制 (`--field`)**：
  - 严格仅支持 `BASIC_PROFILE`，若指定 `PUBLIC_FOLLOWS` 或 `PUBLIC_CONTENT` 探针在创建请求前立即返回 `UNSUPPORTED`，网络请求数严格为 0；
  - 严禁将个人主页的基础资料信号归属或关联到关注列表或内容能力。
- **展示名称探针门控规范 (`probe:bilibili:profile-label`)**：
  - 严格限制能力范围：**仅支持 `BASIC_PROFILE`**（请求其他能力直接返回 `UNSUPPORTED` 且 0 网络请求）；
  - 环境变量双确认：必须配置 `BILIPROFILE_PROFILE_LABEL_VALIDATION_ENABLED=true` 且同时配置合规的 `BILIPROFILE_PROBE_URL`（仅限 `https://space.bilibili.com/<纯数字UID>`）；
  - 严格禁止 CLI URL 绕过：profile-label 模式只读取环境变量中的 URL，不接受 CLI `--url` 覆盖；
  - 最小化单次请求：执行单次 GET、无凭据（`credentials: "omit"`）、不跟随重定向（`redirect: "manual"`），任一条件缺失或 URL 非法时强制安全退出（`SKIPPED_NOT_CONFIGURED`），网络请求数严格为 0；
  - 严格标题结构判定：仅当 `<title>` 命中“非空名称前缀 + 的个人空间”结构时判定为 `PROFILE_LABEL_SIGNAL_OBSERVED`，普通非空标题、空标题或无名称标题一律返回 `PROFILE_LABEL_SIGNAL_NOT_OBSERVED`；
  - 内存与流式上限：保持 $\le 64\text{ KiB}$ 读取硬上限与 $\le 2048$ 字符滑动窗口，命中即取消 reader；绝不提取、打印或持久化任何标题文本。
- **其他受控探针规则**：其他特定受控探针（如 `controlled-basic-profile-probe.ts`）要求显式提供 `--allow-network` 参数，且需具备相应环境确认开关；
- **重定向与非 HTML 防护**：严格禁止自动跟随重定向（`redirect: manual`），遇 3xx、非 HTML 或空响应直接返回脱敏类别且不读取正文；
- **零真实数据留存**：全流程未记录、未持久化任何真实昵称、头像 URL、签名文本、UID 映射或原始响应报文。

---

## 🛡️ 能力门控与不变量架构 (Capability-Gated Architecture)

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
- **`UNVERIFIED`**：尚未满足 Phase 4.8 独立证据标准及 Phase 4.9 人工审查要求，因而未获生产放行的默认安全基线。历史离线测试或单次受控探针观察不改变该状态。
- **`PAGE_REACHABLE`**：单次公开 HTTP GET 请求返回 200，仅代表页面网络可达；**不代表任何具体数据字段已被验证为可读取**。
- **`AVAILABLE_PUBLIC`**：仅用于未来在受控审查批准下使用。对于 `BASIC_PROFILE`，要求 `displayName` 与 `avatarUrl` 必须通过字段契约且为 `PARSED_NONEMPTY`（`avatarUrl` 语法合规），`signature` 可为 `PARSED_NONEMPTY` 或合法缺失并形成 `PARTIAL`；当前阶段三项能力全为 `UNVERIFIED`，不等于已有提取实现。
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
- **`OBSERVED`**：在安全上限与滑动窗口内检测到特定字段的结构信号（不返回、不输出、不持久化具体内容）。
- **`NOT_OBSERVED`**：在安全阈值内未检测到对应字段的结构信号。
- **`BLOCKED`**：检测到字段被平台防护拦截或隐私保护。

### 3. 字段值脱敏校验状态 (Field Value Validation Status)
- **`PARSED_NONEMPTY`**：字段在内存流中已解析且非空。
- **`PARSED_EMPTY_OR_ABSENT`**：字段为空、缺失或不适用。
- **`PARSE_REJECTED`**：候选值不符合安全校验规则（如包含非打印控制符、非法协议方案），已被安全拒绝。
- **`NOT_OBSERVED`**：未找到可解析候选值。

---

## 🛠️ 探针执行与自检命令集

| 命令 | 作用 | 网络行为与安全门控 |
| :--- | :--- | :--- |
| `npm run probe:bilibili:self-test` | 流式内存截断、严格窗口与参数钳制自检 | **纯离线运行，零网络请求** |
| `npm run probe:capability-gating:self-test` | 能力归属隔离与多模式门控自检 (Phase 4.7.5) | **纯离线运行，Spy 保证网络请求次数恒为 0** |
| `npm run probe:basic-profile:self-test` | BASIC_PROFILE 最小字段信号、脱敏值校验与双确认门控离线自检 | **纯离线运行，零网络请求** |
| `npm run probe:connector:self-test` | 能力门控 Connector 拦截与零伪造自检 | **纯离线运行，Spy 保证网络请求次数恒为 0** |
| `npm run probe:basic-profile:controlled` | BASIC_PROFILE 受控单次探针 | **默认离线**；需同时满足 `--allow-network`、纯数字 `--uid` 以及 `BILIPROFILE_FIELD_VALIDATION_ENABLED=true` 和 `BILIPROFILE_OWNER_AUTHORIZED=true` 环境变量，否则直接退出 |
