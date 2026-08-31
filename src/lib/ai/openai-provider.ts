/**
 * BiliProfile Analyzer — OpenAI-compatible Chat Completions Provider
 *
 * Implements a compliant, secure, and isolated OpenAI-compatible AI analysis provider.
 *
 * Security & Invariant Rules:
 * 1. Base URL Normalization:
 *    - Only http/https protocols allowed.
 *    - Rejects URLs containing username, password, query strings, or hash fragments.
 *    - Automatically and idempotently appends `/chat/completions`.
 * 2. API Key Protection:
 *    - API Key is used strictly in-memory during single request execution.
 *    - Never logged, cached, persisted, or echoed in error messages or responses.
 * 3. Contract & Evidence Integrity:
 *    - Input is strictly limited to validated DeterministicReportInput.
 *    - Model output is strictly validated against AiAnalysisResult schema and input evidence IDs.
 * 4. Error Sanitization:
 *    - All network, HTTP, JSON parsing, or schema errors are mapped to sanitized Chinese messages.
 *    - Zero leakage of raw headers, keys, credentials, or upstream bodies.
 * 5. Mockable / Injectable fetch:
 *    - Accepts optional customFetch for 100% pure offline self-tests.
 */

import {
  AiAnalysisProvider,
  AiAnalysisResult,
  OpenAiCompatibleConfig,
} from "@/types/ai-analysis";
import { DeterministicReportInput } from "@/types/processing";
import { validateDeterministicReportInput } from "@/lib/processing/pipeline";
import { validateAiAnalysisResult } from "./validator";

export class OpenAiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiProviderError";
  }
}

/**
 * Normalizes and validates an OpenAI-compatible Base URL.
 *
 * Rules:
 * - Only http: or https: protocols are accepted.
 * - Rejects any URL containing credentials (username:password), query params (?), or fragments (#).
 * - Correctly handles trailing slashes.
 * - Automatically ensures `/chat/completions` suffix without duplicate path segments.
 */
export function normalizeOpenAiBaseUrl(rawUrl: string): {
  valid: boolean;
  endpoint?: string;
  reason?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, reason: "API Base URL 不能为空" };
  }

  const trimmed = rawUrl.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, reason: "API Base URL 格式无效，请输入正确的 HTTP(S) 地址" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, reason: "API Base URL 必须使用 http 或 https 协议" };
  }

  if (url.username || url.password) {
    return { valid: false, reason: "API Base URL 不得包含用户名或密码凭证" };
  }

  if (url.search) {
    return { valid: false, reason: "API Base URL 不得包含查询参数 (?)" };
  }

  if (url.hash) {
    return { valid: false, reason: "API Base URL 不得包含 URL 锚点 (#)" };
  }

  const cleanPath = url.pathname.replace(/\/+$/, "");
  const finalPath = cleanPath.endsWith("/chat/completions")
    ? cleanPath
    : `${cleanPath}/chat/completions`;

  const endpoint = `${url.origin}${finalPath}`;
  return { valid: true, endpoint };
}

/**
 * Validates the in-memory OpenAI configuration.
 */
export function validateOpenAiConfig(config: OpenAiCompatibleConfig): {
  valid: boolean;
  endpoint?: string;
  reason?: string;
} {
  if (!config || typeof config !== "object") {
    return { valid: false, reason: "AI 配置对象无效" };
  }

  const urlRes = normalizeOpenAiBaseUrl(config.apiBaseUrl);
  if (!urlRes.valid || !urlRes.endpoint) {
    return { valid: false, reason: urlRes.reason || "API Base URL 格式不合规" };
  }

  if (!config.apiKey || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    return { valid: false, reason: "API Key 不能为空" };
  }

  if (!config.model || typeof config.model !== "string" || !config.model.trim()) {
    return { valid: false, reason: "模型名称 (Model) 不能为空" };
  }

  return { valid: true, endpoint: urlRes.endpoint };
}

/**
 * Builds the structured system prompt and user message for Chat Completions.
 */
export function buildPromptMessages(reportInput: DeterministicReportInput) {
  const contentItems = reportInput.contentItems ?? [];
  const validEvidenceIds = [
    ...reportInput.evidence.map((e) => e.id),
    ...contentItems.map((item) => item.evidenceId),
  ];

  const systemPrompt = `你是一个敏锐、深刻、富有同理心与科学严谨性的 AI 人物画像观察家。
你的核心任务是：基于用户在 Bilibili 呈现的多源真实行为证据（主动投稿、主动收藏、即时点赞、长期关注），进行严密、克制且有深度的探索性推理，为用户撰写一篇富有洞察力、兼具“人味”与清晰证据边界的「多维行为与兴趣 AI 人物画像报告」。

【核心指导思想（极其重要）】
★ “通过不同行为语义进行交叉验证，而不是把所有数据简单混在一起做主题分类或机械统计。”
★ “必须尊重 samplingMetadata 中的采样语义与边界：区分全量观测与局部样本窗口，证据不足时降低结论强度。”

【零、数据采样语义与统计推断边界（极其重要）】
AI 必须根据传入的 samplingMetadata 严格识别每个数据源的实际观测范围，严禁产生统计学过度外推：
1. 收藏数据通常为有限窗口采样（例如：平台总收藏数可能有 300+ 条，而系统仅采集了最近 20 条）：
   - 当 isComplete = false 时，favoriteCount 仅代表“在当前采集到的 N 条近期样本中命中该主题的条数”；
   - 严禁将样本占比（如 20 条中有 5 条）外推为“用户历史全部收藏中有 25%”；
   - 只能表述为“在当前可观测的近期公开收藏样本中，集中体现为……”；
2. 点赞数据受 Bilibili 官方接口限制，仅能获取最新 20 条（这是“API 可观测窗口完整”，但不是“用户历史总体完整”，platformTotalCount 为 null，isComplete = false）：
   - 点赞仅代表“近期有限窗口内的即时消费偏好”，只能分析当前最新 20 条公开点赞，绝不能推断用户历史全部点赞行为或全局偏好；
3. 跨源验证虽然可以提高证据强度，但「不能消除局部采样的偏差」：
   - 跨源闭环（如同时有点赞、收藏、投稿）表明在当前观测周期内行为一致性极高，但绝不能把近期有限窗口推断为“长期数年不变的固定人格”。

【一、四类核心行为数据的心理语义与证据权重】
1. 投稿 / 创作 (CONTENT) - 权重最高 ★★★★★：
   - 心理语义：高能耗的主动制作、剪辑、调试与公开发布；
   - 核心价值：反映用户的实际动手实践能力、掌握的工具链（如 AI 生成、超分、剪辑）、主动表达的审美偏好与分享欲；
2. 收藏 (FAVORITE) - 权重次高 ★★★★☆：
   - 心理语义：中高能耗的主动保存、建立个人内容库与信息资产；
   - 核心价值：反映长期价值判断、审美沉淀、深度学习资料或工具备忘；
   - ⚠️ 关键校准（禁止过度推断）：收藏强于点赞，但「绝不能直接等价于深度热爱或重度兴趣」。收藏可能包含知识备忘、资料归档或“标记稍后看”。严禁输出“收藏了86个视频所以深度热爱”这类机械推断；
3. 点赞 (LIKE) - 即时认可 ★★★☆☆：
   - 心理语义：低能耗的浏览即时正向互动、轻量消费与近期趣味；
   - ⚠️ 关键校准（严禁脑补玩家身份）：点赞仅代表即时消费偏好，严禁仅凭点赞推断“用户是该领域的重度核心玩家/从业者”。点赞必须与收藏、投稿结合才能印证长期兴趣；
4. 关注 (FOLLOW) - 长期生态订阅 ★★★★☆：
   - 心理语义：长期订阅的创作者群体与信息源偏好。

【二、行为交叉验证原则 (Cross-Source Confirmation)】
AI 必须理解：投稿、收藏、点赞不是三个孤立的内容列表，而是同一用户不同行为层次的相互印证：
- 投稿 + 收藏 + 点赞 (三源印证)：表明该主题贯穿了“即时消费 → 长期沉淀 → 主动产出”，兴趣置信度极高，具有强行为闭环；
- 投稿 + 收藏 (双源印证)：表明用户不仅消费与保存该类内容，更实际掌握相关工具进行了主动加工或创作；
- 仅有收藏 (单源沉淀)：表明处于知识储备、工具箱积累或资料归档阶段，尚未延伸至主动表达；
- 仅有点赞 (单源互动)：表明处于轻量即时消费阶段，尚未形成沉淀或实践；
- ⚠️ 严禁虚构因果链：当观察到多源数据时，只能说明“多个行为源共同指向并印证该主题”，严禁脑补“用户先点赞、后收藏、最后创作”这种未经时间戳证实的因果故事。

【三、主题 × 行为 与 主题 × 时间 结合（六大行为画像维度）】
结合 behaviorTopicMatrix 中的来源分布与 timeSpan/temporalPatterns，识别以下典型画像形态：
1. 长期稳定兴趣 (LONG_TERM_STABLE)：时间跨度长（数月/数年）且持续活跃，伴随收藏/投稿，近期仍有点赞互动；
2. 历史沉淀兴趣 (HISTORICAL)：早期集中收藏或创作，但近期已长期无新动态（属于历史阶段沉淀）；
3. 近期涌现热点 (RECENT_RISING / RECENT_ONLY)：集中在近期涌现，早期无记录（属于近期探索或新兴热点）；
4. 创作/实践导向型 (CREATIVE_PRACTICE)：投稿比例高，但收藏/点赞相对较少（侧重主动输出与工具实践）；
5. 消费/消遣导向型 (CONSUMPTION_ORIENTED)：点赞与轻量消费多，但几乎无投稿与深度收藏（侧重即时娱乐）；
6. 知识储备/信息沉淀型 (INFORMATION_ARCHIVAL)：收藏明显多于点赞和投稿，无创作（侧重信息检索、工具库与知识归档）。

【四、严禁以数据量等同于兴趣强度 (以质取胜)】
- 例如：主题 A (投稿 3 + 收藏 20 + 点赞 5) 虽总量小于 主题 B (投稿 0 + 收藏 100 + 点赞 0)，但主题 A 具备主动创作与多源闭环，其行为证据强度显著高于单纯信息归档的主题 B；
- AI 必须综合 sourceCoverage、行为类型、信号强度、时间稳定性与证据质量，严禁简单按数据总量排名。

【五、挖掘跨主题组合与工具赋能洞察】
- 严禁割裂罗列孤立主题（如生硬分开“喜欢动漫”与“喜欢 AI”）；
- 重点捕捉跨主题交集（如“二次元 + AI”）：深入观察用户是否使用 AI 工具将二次元素材动态化或超分，进而提炼出“AI 对该用户不仅是泛技术关注，更是实现其视觉审美偏好的一种赋能工具”这一深层假说。

【六、认知与推理的四个层级 (每个 Finding 严格遵守)】
报告应包含约 4 个核心 Finding。每个 Finding 展开为 2~4 个自然段（约 350~500 字，段落间用 \\n\\n 分隔），严格按以下链条推进：
1. 事实证据 (Fact)：明确引用具体的 ev_item_*，列出标题、来源类型（投稿/收藏/点赞）与制作细节；
2. 行为模式归纳 (Observation)：分析该主题在不同行为源之间的分布与时间跨度特征；
3. 深入解释“为什么” (Why & Attraction Mechanism)：剖析吸引机制与心智同构性（为什么是这类素材？为什么选择动手加工？为什么在不同领域展现出相似的参与方式？）；
4. 克制的探索性假说 (Hypothesis)：提出条件性画像假说（如：“相比单纯被动观看，更倾向于可亲自调试与产出成品的体验”）；
5. 可证伪与修正边界 (Boundary)：明确指出该假说在何种反例或后续样本下需要修正。

【七、消除 AI 套话与安全推断红线】
- 严禁机械公文连接词：“总体而言”、“由此可以看出”、“这表明”、“可以看出用户具有……”；
- 严禁文学化绝对定性：“极其纯粹”、“天生”、“本能”、“情有独钟”、“高度纯粹”；
- 严禁推断现实敏感属性：严禁推测 MBTI 代码、精神疾病、现实职业、财富收入、真实年龄、政治立场、宗教信仰、身心健康状况；
- 每一个 Finding 的 evidenceIds 必须且仅能包含正文中实际深入分析的合法 ID。

【输出 JSON 格式规范】：
{
  "schemaVersion": "ai-analysis-result/v1",
  "provider": "OPENAI_COMPATIBLE",
  "summary": "<核心画像导语：1 句富有穿透力的人物核心概括 + 1~2 个流畅长段落（用\\\\n\\\\n分隔），提炼多源行为主线与心智闭环>",
  "findings": [
    {
      "id": "finding_descriptive_id_1",
      "category": "TOPIC_INTERPRETATION",
      "statement": "【生动凝练的小标题】\\\\n\\\\n<正文多段深度自然语言分析，约 350~500 字，用\\\\n\\\\n分段。严格落实 Fact → Observation → Why → Hypothesis → Boundary 推理链条。>",
      "evidenceIds": ["<本 finding 深入分析的最小充分 ev_item_* 及统计 ID>"]
    }
  ],
  "limitations": [
    "<方法论局限性说明条目1>",
    "<方法论局限性说明条目2>"
  ]
}

category 必须在以下枚举中选择：
- "TOPIC_INTERPRETATION"
- "DIVERSITY_ASSESSMENT"
- "SAMPLE_RELIABILITY"
- "SOURCE_LIMITATION"
- "DATA_QUALITY"`;

  const contentEvidenceList = contentItems.map((item) => {
    let sourceLabel = "公开内容/视频";
    if (item.sourceType === "CONTENT") sourceLabel = "主动投稿/创作";
    else if (item.sourceType === "FAVORITE") sourceLabel = "主动收藏/价值沉淀";
    else if (item.sourceType === "LIKE") sourceLabel = "即时点赞/互动";
    else if (item.sourceType === "FOLLOW") sourceLabel = "长期关注/订阅";

    return {
      evidenceId: item.evidenceId,
      sourceType: sourceLabel,
      title: item.title,
      description: item.description,
      authorName: item.authorName || undefined,
      publishedAt: item.publishedAt || undefined,
      interactionAt: item.interactionAt || item.observedAt || undefined,
      matchedTopics: item.matchedTopics.map((m) => {
        const strengthBadge = m.signalStrength === "STRONG" ? "强信号/主标题" : (m.signalStrength === "MEDIUM" ? "中等信号/制作与正文描述" : "弱信号/随附外链");
        return `${m.topicName}(${strengthBadge}, 命中词:${m.matchedTerm})`;
      }),
      folderName: (item.metadata?.folderName as string) || undefined,
    };
  });

  const minimalReportContext = {
    macroStatistics: {
      totalInputRecords: reportInput.diagnosticsSummary.totalInput,
      analyzedRecords: reportInput.diagnosticsSummary.analyzedCount,
      topicDistribution: reportInput.observations.find((o) => o.category === "TOPIC_DISTRIBUTION")?.statement,
      diversityObservation: reportInput.observations.find((o) => o.category === "DIVERSITY")?.statement,
    },
    sourceAvailability: reportInput.sourceAvailability,
    samplingMetadata: reportInput.samplingMetadata,
    behaviorTopicMatrix: reportInput.behaviorTopicMatrix,
    temporalPatterns: reportInput.temporalPatterns,
    contentEvidenceList: contentEvidenceList.length > 0 ? contentEvidenceList : undefined,
    limitations: reportInput.limitations,
    validEvidenceIds,
  };

  const userContent = `请基于以下多源确定性统计矩阵、时间演进指标与真实内容证据清单生成深度人物画像分析结果：\n${JSON.stringify(minimalReportContext, null, 2)}`;

  return { systemPrompt, userContent };
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) from model output.
 */
function cleanModelOutputJson(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return cleaned;
}

/**
 * Executes an OpenAI-compatible Chat Completions call and returns validated AiAnalysisResult.
 */
export async function generateOpenAiAnalysis(
  reportInput: DeterministicReportInput,
  config: OpenAiCompatibleConfig,
  customFetch: typeof fetch = globalThis.fetch
): Promise<AiAnalysisResult> {
  // 1. Pre-validation of input
  const inputValidation = validateDeterministicReportInput(reportInput);
  if (!inputValidation.valid) {
    throw new OpenAiProviderError("DeterministicReportInput 契约校验未通过");
  }

  // 2. Validate configuration
  const configValidation = validateOpenAiConfig(config);
  if (!configValidation.valid || !configValidation.endpoint) {
    throw new OpenAiProviderError(configValidation.reason || "AI 配置参数无效");
  }

  const endpoint = configValidation.endpoint;
  const { systemPrompt, userContent } = buildPromptMessages(reportInput);

  // 3. Prepare request payload
  const requestBody = {
    model: config.model.trim(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let response: Response;
  try {
    response = await customFetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenAiProviderError("AI API 请求超时（超过 30 秒）");
    }
    throw new OpenAiProviderError("AI API 网络连接失败，请检查网络或 Base URL");
  } finally {
    clearTimeout(timer);
  }

  // 4. Handle HTTP Status
  if (!response.ok) {
    const status = response.status;
    if (status === 401) {
      throw new OpenAiProviderError("AI API 认证失败 (HTTP 401)，请检查 API Key 是否正确");
    }
    if (status === 403) {
      throw new OpenAiProviderError("AI API 拒绝访问 (HTTP 403)，请检查权限或模型访问权");
    }
    if (status === 404) {
      throw new OpenAiProviderError("AI API 接口不存在 (HTTP 404)，请检查 Base URL 与模型名称");
    }
    if (status === 429) {
      throw new OpenAiProviderError("AI API 请求频率过高或账户额度不足 (HTTP 429)");
    }
    if (status >= 500 && status < 600) {
      throw new OpenAiProviderError(`上游 AI 服务发生故障 (HTTP ${status})，请稍后重试`);
    }
    throw new OpenAiProviderError(`AI API 请求失败 (HTTP ${status})`);
  }

  // 5. Parse upstream response JSON
  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    throw new OpenAiProviderError("AI 服务返回了无法解析的响应内容（非 JSON）");
  }

  if (!responseData || typeof responseData !== "object") {
    throw new OpenAiProviderError("AI 服务返回了空的响应对象");
  }

  const typedResp = responseData as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawContent = typedResp.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string" || !rawContent.trim()) {
    throw new OpenAiProviderError("AI 模型未返回有效文本内容");
  }

  // 6. Clean and parse model JSON content
  const cleanedJson = cleanModelOutputJson(rawContent);
  let parsedModelOutput: unknown;
  try {
    parsedModelOutput = JSON.parse(cleanedJson);
  } catch {
    throw new OpenAiProviderError("AI 模型输出格式错误，未能生成标准 JSON");
  }

  // 7. Strict contract and evidence validation
  const validation = validateAiAnalysisResult(parsedModelOutput, reportInput);
  if (!validation.valid) {
    throw new OpenAiProviderError(
      `AI 模型输出未通过契约或证据链校验 (${validation.errors[0] || "校验失败"})`
    );
  }

  return parsedModelOutput as AiAnalysisResult;
}

/**
 * Factory creating an OpenAiCompatibleProvider instance with in-memory config.
 */
export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig,
  customFetch?: typeof fetch
): AiAnalysisProvider {
  return {
    id: "OPENAI_COMPATIBLE",
    generate: async (reportInput: DeterministicReportInput) => {
      return generateOpenAiAnalysis(reportInput, config, customFetch);
    },
  };
}
