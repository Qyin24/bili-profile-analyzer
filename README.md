# BiliProfile Analyzer

面向普通 Bilibili 用户的公开数据画像与内容偏好分析 Web App。

本项目严格遵循 [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) 的架构设计与分阶段开发规范进行演进。

---

## 📌 当前阶段状态：Phase 5.1 — 持久化任务生命周期约束

> **说明**：当前项目处于 **Phase 5.1** 阶段。已建立严格的持久化任务生命周期约束与状态机校验机制：
> - **服务端纯函数生命周期保护**：定义严格的 9 阶段顺序（`COLLECT` → `NORMALIZE` → `CLEAN` → `EXTRACT` → `AGGREGATE` → `STATISTICAL_ANALYSIS` → `AI_ANALYSIS` → `SYNTHESIS` → `REPORT`），由服务端生命周期规则统一保护，拦截阶段倒退、进度倒退、空更新与终态篡改，浏览器不能任意写入彼此矛盾的状态；
> - **状态转换与终态不可变性**：`PENDING` 仅允许进入 `RUNNING` 或 `CANCELLED`；`RUNNING` 仅允许进入 `COMPLETED`、`FAILED`、`CANCELLED`；`COMPLETED`、`FAILED`、`CANCELLED` 作为终态不可再次修改状态、阶段、进度或数据源执行记录；
> - **自述快照原子创建与隐私隔离**：继续保持 Phase 5.0 的自述快照原子固化，通用任务接口与序列化器严格执行最小读取与脱敏，自述原文绝不泄露；
> - **公开数据与报告边界**：公开数据采集能力继续处于离线安全门控拦截状态，尚未接入真实网络；当前报告与画像结果仍为本地受控示例报告，不发起任何外部网络请求与真实 AI 调用。

---

## 💾 数据库开发与配置说明 (PostgreSQL / Prisma)

本项目采用 **Prisma ORM** 与 **PostgreSQL** 数据库（`provider = "postgresql"`）。

### 1. 前置条件 (Prerequisites)
- **Node.js**：`>= 20.0.0`
- **PostgreSQL**：`>= 14.0`（用于实际应用数据库迁移与数据持久化）

### 2. 环境变量配置
1. 复制模板创建本地环境变量文件：
   ```bash
   cp .env.example .env.local
   ```
2. 在 `.env.local` 中配置真实的 PostgreSQL 连接串：
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
   ```
> ⚠️ **安全警告**：`.env` 与 `.env.local` 均已被 `.gitignore` 忽略，**严禁将包含真实账号密码的 `.env.local` 提交至代码仓库**。

### 3. 常用数据库操作命令

```bash
# 1. 校验 Prisma Schema 格式与模型规范
npx prisma validate

# 2. 根据 Prisma Schema 生成类型安全的 Prisma Client
npx prisma generate

# 3. 在具备 PostgreSQL 数据库连接时应用迁移
npx prisma migrate deploy
# 或在开发环境中创建新迁移
npx prisma migrate dev

# 4. 启动 Prisma Studio 在浏览器中可视化管理数据库
npx prisma studio
```

---

## 🗺️ 页面与功能架构

### 1. 页面导航 (Routes)
- `/` → **开始分析**：温暖引导式开始，支持纯数字 UID 与空间主页链接本地解析，3 个可选补充信息字段，4 步自然进度展示
- `/dashboard` → **我的报告**：历史分析卡片列表、精简概览指标（≤3 张）、自然语言状态与信息完整度、查看报告直达入口
- `/entities` → **内容主题**：公开内容主题分类与关注内容代表示例，搜索与筛选保留，技术细节折叠
- `/graph` → **关系概览**：轻量纯 SVG 关系图，通俗展示主题与关注内容之间的联系
- `/analysis` → **你的内容画像**：基于有限公开与自述快照的结构化报告、分析解读、参考依据抽屉与针对报告问一问
- `/settings` → **设置**：你补充的信息、分析使用范围、数据与隐私（停止以后使用 Revoke 与 删除这项信息及相关历史结果 Purge）

### 2. API 路由 (Route Handlers)
- `GET /api/targets` → 查询分析目标列表或按 `?uid=` 查询
- `POST /api/targets` → 验证必要字段并创建/查找分析目标
- `GET /api/taxonomy` → 获取受控主题分类体系列表
- `GET /api/tasks` → 获取任务脱敏摘要列表（通过 Repository 层访问）
- `POST /api/tasks` → 创建新任务与不可变快照（每次创建新任务，不覆盖历史记录）
- `GET /api/tasks/[id]` → 获取单个分析任务脱敏详情及数据源状态
- `PATCH /api/tasks/[id]` → 事务更新任务状态与数据源记录（受服务端生命周期约束校验）
- `GET /api/self-profile` → 获取本地自述字段与授权状态
- `PUT /api/self-profile` → 更新本地自述字段（严格白名单校验）
- `POST /api/self-profile/revoke` → 停止个人说明在未来的分析使用（保留历史快照）
- `DELETE /api/self-profile/purge` → 彻底删除个人说明与关联快照（标记历史任务失效）

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
| `npm run db:migrate` | 应用 PostgreSQL 数据库迁移 | 纯本地 |
| `npm run db:seed` | 幂等填充演示种子数据与默认自述配置 | 纯本地 |
| `npm run db:studio` | 启动 Prisma Studio 可视化管理界面 | 纯本地 |
| `npm run dev` | 启动本地 Next.js 开发服务器 (`http://localhost:3000`) | 纯本地 |
| `npm run type-check` | 执行 TypeScript 静态类型检查（`tsc --noEmit`） | 纯本地 |
| `npm run lint` | 执行 ESLint 代码规范检查 | 纯本地 |
| `npm run build` | 编译构建生产打包产物 | 纯本地 |
| `npm run test:entities-graph-ui` | **[Phase 7.2]** `/entities` 与 `/graph` 页面真实状态收口与受控空状态测试套件 | **纯本地** |
| `npm run test:analysis-readonly-ui` | **[Phase 6.4]** `/analysis` 页面只读展示已验证任务工件与 view-model 状态测试套件 | **纯本地** |
| `npm run test:task-ai-workflow` | **[Phase 6.3 & 6.3.1]** 任务级离线 MOCK AI 工件自动生成、终态保护与完成编排测试套件 | **纯本地** |
| `npm run test:ai-analysis-storage` | **[Phase 6.2]** 任务级 AI 分析工件存储、并发幂等与只读 API 测试套件 | **纯本地** |
| `npm run test:ai-contract` | **[Phase 6.1]** 离线 AI 分析契约、Provider Registry 与失败关闭边界测试套件 | **纯本地内存** |
| `npm run test:deterministic-report-storage` | **[Phase 5.2.3.2]** 确定性报告工件存储、并发幂等与严格校验测试套件 | **纯本地** |
| `npm run test:deterministic-pipeline` | **[Phase 5.2.2 & 5.2.3.2]** 确定性数据处理流水线与报告输入严格校验测试套件 | **纯本地内存** |
| `npm run test:task-lifecycle` | **[Phase 5.1.2]** 任务生命周期状态转换与路由集成测试套件 | **纯本地** |
| `npm run test:self-profile` | **[Phase 5.0.3]** 隔离且最小读取的自述与快照验证套件 | **纯本地** |
| `npm run probe:connector:self-test` | **[Phase 4.3]** 能力门控 Connector 拦截与零伪造自检 | **纯离线，Fake fetch 调用数为 0** |
| `npm run probe:basic-profile:self-test` | **[Phase 4.4b]** BASIC_PROFILE 最小字段信号离线解析自检 | **纯离线，零网络请求** |
| `npm run probe:bilibili:profile-label` | **[Phase 4.4]** 个人空间展示名称最小信号探针（双确认环境变量受控单次） | 显式配置下单次受控流式探测 |
| `npm run probe:bilibili-profile-signal` | **[Phase 4.2]** 最小公开资料信号探针（地址/标题/头像引用结构检测） | 显式配置下单次受控流式探测 |
| `npm run probe:bilibili:self-test` | **[Phase 4.2.1/4.3.2]** 流式内存安全与严格窗口自检 | **纯离线，零网络请求** |
| `npm run probe:bilibili` | **[Phase 4.0]** 页面可达性探针（未配环境变量时安全跳过） | 显式配置下单次请求 |
| `npm start` | 启动生产环境服务 | 纯本地 |

---

### 3. 公开数据能力验证探针 (Phase 4.0 Probe)

探针默认处于离线安全保护状态，不发起任何网络请求。

- **安全查看帮助（不发起网络请求）**：
  ```bash
  npm run probe:bilibili -- --help
  ```

- **未来受控手动验证格式（仅在具备明确授权时由人工执行，本次阶段不执行）**：
  ```bash
  npm run probe:bilibili -- --capability BASIC_PROFILE --url "https://space.bilibili.com/{目标标识}" --confirm-public-only
  ```

---

## 🔒 隐私与合规规范

1. **本地存储与最小化授权**：用户填写的自述信息仅存放在受控本地数据库，任务发起时只快照用户明确勾选允许的字段。
2. **响应链最小读取与脱敏**：通用任务 API 和 Dashboard 仅在数据库层查询 ID 统计元数据，绝不读取或暴露自述原文。
3. **状态机与不可变终态**：任务生命周期状态单向推进，终态任务防篡改。
4. **完全可撤回与可删除**：支持“停止未来使用”（保留历史分析）与“彻底清除”（永久清除字段与快照，标记任务失效）两级数据处置权限。
5. **零凭证存储**：不获取任何账号密码、Cookie、SESSDATA、Token、Wbi 或私密个人信息。
6. **严格禁止敏感推断**：严禁推断个体性格标签、MBTI、心理健康、身体疾病、政治、宗教、性取向或性别认同。
7. **能力熔断机制**：任何未经验证或受限的公开数据能力严禁接入产品生产流。
