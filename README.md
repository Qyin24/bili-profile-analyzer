# BiliProfile Analyzer

面向普通 Bilibili 用户的公开数据画像与内容偏好分析 Web App。

本项目严格遵循 [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) 的架构设计与分阶段开发规范进行演进。

---

## 📌 当前阶段状态：Phase 5.2.2 — 确定性报告输入与证据包构建（纯本地）

> **说明**：当前项目处于 **Phase 5.2.2** 阶段。已在纯函数数据处理流水线之上新增结构化、可追溯且安全的“确定性报告输入与证据包”层（`DeterministicReportInput`）：
> - **标准化契约与版本控制**：固定顶层 `schemaVersion = "deterministic-report-input/v1"` 与 `taxonomyVersion`；
> - **结构化客观事实观察 (`observations`)**：面向普通用户的中性事实陈述，涵盖样本规模、最高主题占比、主题分布概览、基于香农熵的多样性离散程度及来源受限说明；
> - **最小化细粒度证据条目 (`evidence`)**：每个 observation 均必须引用至少一个存在的 evidenceId，彻底杜绝无证据推断与虚假结论；
> - **客观局限性与诊断摘要 (`limitations` & `diagnosticsSummary`)**：如实陈述数据范围、样本门槛、未分类条目及受限来源标记；
> - **严格防御与校验机制 (`validateDeterministicReportInput`)**：离线校验悬空引用、重复 ID、非有限数值（NaN/Infinity）、非法 schema 版本以及自述字段零泄露；
> - **全流程零泄露与零网络**：绝不包含原始长文本正文、自述原文或 `SnapshotField.value`，零 fetch、零外部网络、零数据库写入。
> 
> **Phase 5.2.2 核心成果**：
> - ✅ **报告输入契约定义 (`src/types/processing.ts`)**：
>   - 规定 `DeterministicReportInput`、`ReportObservation`、`ReportEvidence`、`ObservationCategory`、`EvidenceType`、`ReportDiagnosticsSummary` 与 `ReportInputValidationResult`。
> - ✅ **构建器与校验器实现 (`src/lib/processing/report-input.ts` & `pipeline.ts`)**：
>   - `buildDeterministicReportInput(result)`：将 `DeterministicAnalysisResult` 纯函数转换为证据链闭环的报告输入；
>   - `validateDeterministicReportInput(input)`：独立执行 7 大维度的安全与结构有效性校验。
> - ✅ **全套离线回归验证 (`npm run test:deterministic-pipeline`)**：
>   - 包含 Phase 5.2 (a~j)、Phase 5.2.1 (k~q) 以及 Phase 5.2.2 专项测试 (r~y) 共 25 项全量测试断言。
> 
> **当前阶段边界与明确未包含**：
> - ⚠️ **产品分析报告（`/analysis`）仍严格展示本地受控示例报告**。
> - ❌ 尚未接入生产级 Bilibili Connector、数据采集器或爬虫服务。
> - ❌ 尚未接入真实 LLM / AI SDK / 外部模型 API（将在 Phase 6+ 开展）。
> - ❌ 严禁使用任何 Cookie、SESSDATA、Token、Wbi 或登录凭证。

---

## 🗺️ 页面与功能架构

### 1. 页面导航 (Routes)
- `/` → 自动重定向至 `/dashboard`
- `/dashboard` → **开始分析**：UID/链接输入、自述授权确认、发起模拟流程、进度反馈与最近分析记录
- `/entities` → **关注内容**：分析涉及的模拟关注博主列表与分类筛选
- `/graph` → **关系概览**：直观展示“你 — 内容主题 — 关注博主”三层拓扑图谱
- `/analysis` → **分析报告**：内容偏好概览、主要主题分布、深度解读、依据抽屉与智能问答
- `/settings` → **设置**：个人说明补充、单项授权、停止使用与彻底删除管理（真实持久化至 SQLite）

### 2. API 路由 (Route Handlers)
- `GET /api/tasks` → 获取任务脱敏摘要列表（最小读取投影，绝无自述原文）
- `POST /api/tasks` → 创建或复用 Target，校验自述授权并在事务中新建任务与不可变快照（响应链最小读取回读，返回脱敏摘要）
- `GET /api/tasks/[id]` → 获取单个分析任务脱敏详情及数据源状态（最小读取投影，无自述原文）
- `PATCH /api/tasks/[id]` → 执行状态机生命周期校验，事务更新任务状态与数据源记录（最小读取投影，返回脱敏摘要）
- `GET /api/self-profile` → 获取本地自述字段与授权状态（设置页专用）
- `PUT /api/self-profile` → 更新本地自述字段（严格白名单与类型校验）
- `POST /api/self-profile/revoke` → 停止个人说明在未来的分析使用（保留历史快照）
- `DELETE /api/self-profile/purge` → 彻底删除个人说明与关联快照（严格限定当前 Profile，标记历史任务失效）

---

## 🛠️ 前置要求 (Prerequisites)

- **Node.js**：`>= 20.0.0`
- **npm**：`>= 10.0.0`

---

## 🚀 常用命令 (Scripts)

| 命令 | 作用 | 网络行为 |
| :--- | :--- | :--- |
| `npm install` | 安装项目依赖项 | 本地/npm 仓库 |
| `npm run db:generate` | 根据 Prisma Schema 生成 Prisma Client | 纯本地 |
| `npm run db:migrate` | 应用本地 SQLite 数据库迁移 | 纯本地 |
| `npm run db:seed` | 幂等填充演示种子数据与默认自述配置 | 纯本地 |
| `npm run db:studio` | 启动 Prisma Studio 可视化管理界面 | 纯本地 |
| `npm run dev` | 启动本地 Next.js 开发服务器 (`http://localhost:3000`) | 纯本地 |
| `npm run type-check` | 执行 TypeScript 静态类型检查（`tsc --noEmit`） | 纯本地 |
| `npm run lint` | 执行 ESLint 代码规范检查 | 纯本地 |
| `npm run build` | 编译构建生产打包产物 | 纯本地 |
| `npm run test:deterministic-pipeline` | **[Phase 5.2.2]** 确定性数据处理流水线与报告输入测试套件 | **纯本地内存** |
| `npm run test:task-lifecycle` | **[Phase 5.1.2]** 任务生命周期状态转换与路由集成测试套件 | **纯本地 SQLite** |
| `npm run test:self-profile` | **[Phase 5.0.3]** 隔离且最小读取的自述与快照验证套件 | **纯本地 SQLite** |
| `npm run probe:connector:self-test` | **[Phase 4.3]** 能力门控 Connector 拦截与零伪造自检 | **纯离线，Fake fetch 调用数为 0** |
| `npm run probe:bilibili:self-test` | **[Phase 4.2.1]** 流式内存安全与参数钳制自检 | **纯离线，零网络请求** |
| `npm run probe:bilibili` | **[Phase 4.0]** 页面可达性探针（未配环境变量时安全跳过） | 显式配置下单次请求 |
| `npm start` | 启动生产环境服务 | 纯本地 |

---

## 🔒 隐私与合规规范

1. **本地存储与最小化授权**：用户填写的自述信息仅存放在本地 SQLite，任务发起时只快照用户明确勾选允许的字段。
2. **响应链最小读取与脱敏**：通用任务 API 和 Dashboard 仅在数据库层查询 ID 统计元数据，绝不读取或暴露自述原文。
3. **状态机与不可变终态**：任务生命周期状态单向推进，终态任务防篡改。
4. **完全可撤回与可删除**：支持“停止未来使用”（保留历史分析）与“彻底清除”（永久清除字段与快照，标记任务失效）两级数据处置权限。
5. **零凭证存储**：不获取任何账号密码、Cookie、SESSDATA、Token、Wbi 或私密个人信息。
6. **严格禁止敏感推断**：严禁推断个体性格标签、MBTI、心理健康、身体疾病、政治、宗教、性取向或性别认同。
7. **能力熔断机制**：任何未经验证或受限的公开数据能力严禁接入产品生产流。
