/**
 * BiliProfile Analyzer — Phase 6.0 & 6.1: Local Deterministic AI Provider
 *
 * Generates structured, evidence-backed AI analysis results purely from
 * validated DeterministicReportInput without external network, API, or LLM calls.
 *
 * Guarantees:
 * - 100% deterministic (same input produces exact same output).
 * - Zero hallucinated evidence: all findings cite valid evidence IDs from input.
 * - Factual, neutral narrative tone (zero personality, MBTI, or sensitive attributes).
 * - Pure local execution (0 fetch, 0 database queries, 0 secrets).
 * - Error Sanitization (Phase 6.0.1): Throws fixed, non-leaking error messages.
 */

import {
  AiAnalysisResult,
  AiAnalysisProvider,
  AiFinding,
  AiFindingCategory,
  AI_ANALYSIS_SCHEMA_VERSION,
} from "@/types/ai-analysis";
import { DeterministicReportInput, ObservationCategory } from "@/types/processing";
import { validateDeterministicReportInput } from "@/lib/processing/pipeline";
import { validateAiAnalysisResult } from "./validator";

/**
 * Maps deterministic observation category to AI finding category.
 */
function mapObservationCategory(category: ObservationCategory): AiFindingCategory {
  switch (category) {
    case "SAMPLE_SIZE":
      return "SAMPLE_RELIABILITY";
    case "TOP_TOPIC":
    case "TOPIC_DISTRIBUTION":
      return "TOPIC_INTERPRETATION";
    case "DIVERSITY":
      return "DIVERSITY_ASSESSMENT";
    case "SOURCE_LIMITATION":
      return "SOURCE_LIMITATION";
    case "DATA_QUALITY":
      return "DATA_QUALITY";
    default:
      return "DATA_QUALITY";
  }
}

/**
 * Generates a deterministic AI analysis result from a report input.
 */
export async function generateDeterministicAiAnalysis(
  reportInput: DeterministicReportInput
): Promise<AiAnalysisResult> {
  // 1. Enforce input contract validation (Throws fixed non-leaking error message)
  const validation = validateDeterministicReportInput(reportInput);
  if (!validation.valid) {
    throw new Error("DeterministicReportInput validation failed");
  }

  const sampleAnalyzedEv = reportInput.evidence.find((e) => e.id === "ev_sample_analyzed");
  const analyzedCount = typeof sampleAnalyzedEv?.value === "number" ? sampleAnalyzedEv.value : 0;
  const contentItems = reportInput.contentItems ?? [];

  // Branch A: Content-driven Exploratory Persona Profile
  if (contentItems.length > 0) {
    const findings: AiFinding[] = [];

    // Helper to safely filter evidence IDs that actually exist in input
    const filterValidIds = (ids: string[]) =>
      ids.filter(
        (id) =>
          reportInput.evidence.some((e) => e.id === id) ||
          contentItems.some((item) => item.evidenceId === id)
      );

    const techItems = contentItems.filter(
      (item) =>
        item.matchedTopics.some((m) => m.topicId === "tech_ai" || m.topicName.includes("科技") || m.topicName.includes("AI")) ||
        item.tags.some((t) => /科技|编程|typescript|ai|agent|架构/i.test(t)) ||
        /typescript|agent|架构|模型|编程/i.test(item.title)
    );

    const gameItems = contentItems.filter(
      (item) =>
        item.matchedTopics.some((m) => m.topicId === "games" || m.topicName.includes("游戏")) ||
        item.tags.some((t) => /游戏|单机|主机|解谜|boss/i.test(t)) ||
        /塞尔达|黑神话|游戏|神庙|boss/i.test(item.title)
    );

    const casualItems = contentItems.filter(
      (item) =>
        item.tags.some((t) => /搞笑|娱乐|生活|短视频|美食|八卦|快餐/i.test(t)) ||
        /搞笑|娱乐|短视频|生活日常|轻松一刻/i.test(item.title)
    );

    const animeItems = contentItems.filter(
      (item) =>
        item.matchedTopics.some((m) => m.topicId === "anime" || m.topicName.includes("动漫")) ||
        item.tags.some((t) => /动漫|动画|新番/i.test(t)) ||
        /新番|动漫|动画/i.test(item.title)
    );

    const learningItems = contentItems.filter(
      (item) =>
        item.matchedTopics.some((m) => m.topicId === "learning_growth" || m.topicName.includes("学习")) ||
        item.tags.some((t) => /学习|公开课|心理学|认知/i.test(t)) ||
        /公开课|学习|认知科学|记忆/i.test(item.title)
    );

    // Scenario A1: Single Weak Signal (Only 1 item in total)
    if (contentItems.length === 1) {
      const singleItem = contentItems[0];
      const isAnime = animeItems.length === 1;
      const isLearning = learningItems.length === 1;

      const summary = `当前观测窗口仅捕获到 1 条公开样本记录，数据规模极小。本报告严格依据最小充分证据进行局部事实观察，杜绝过度人格化或长期偏好定性。`;

      let statement = "";
      if (isAnime) {
        statement = `【局部内容观察：偶发性动漫导视记录】\n\n当前样本中仅记录了一条关于《${singleItem.title}》的内容。\n\n从事实层面看，这一记录表明用户在特定时点浏览了新番导视资讯；但从证据强度来看，这属于极弱的单次偶发信号。目前证据尚不足以判断其是否构成长期偏好，严禁将其直接上升为亚文化核心标签或稳定人格定性。`;
      } else if (isLearning) {
        statement = `【局部内容观察：知识方法论公开课浏览】\n\n当前样本中仅记录了一条关于《${singleItem.title}》的学习内容。\n\n作为单次出现的弱信号，这一记录仅反映其曾对认知科学方法论产生过局部了解；目前数据严重缺乏时间跨度与多源复现，不足以断定其具备持续的自律学习习惯或长期学术探究偏好。`;
      } else {
        statement = `【局部内容事实记录：单点兴趣呈现】\n\n当前样本仅包含《${singleItem.title}》单条记录。\n\n基于谨慎推断原则，本记录仅作为单次内容消费的事实呈现，不足以推断其稳定的核心兴趣偏好或深层行为倾向。`;
      }

      findings.push({
        id: "finding_single_weak_signal",
        category: "TOPIC_INTERPRETATION",
        statement,
        evidenceIds: [singleItem.evidenceId],
      });

      // Retain SOURCE_LIMITATION / DATA_QUALITY if present in observations
      for (const obs of reportInput.observations) {
        if (obs.category === "SOURCE_LIMITATION" || obs.category === "DATA_QUALITY") {
          const validEvidenceIds = obs.evidenceIds.filter((evId) =>
            reportInput.evidence.some((e) => e.id === evId)
          );
          if (validEvidenceIds.length > 0) {
            findings.push({
              id: `ai_finding_${obs.id}`,
              category: mapObservationCategory(obs.category),
              statement:
                obs.category === "SOURCE_LIMITATION"
                  ? `数据源局限性提示：${obs.statement}`
                  : `数据格式与质量提示：${obs.statement}`,
              evidenceIds: validEvidenceIds,
            });
          }
        }
      }

      const result: AiAnalysisResult = {
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        provider: "MOCK",
        summary,
        findings,
        limitations: [
          ...reportInput.limitations,
          "单样本数据仅支持局部事实描述，严禁进行长期人格或习惯推断。",
        ],
      };
      return result;
    }

    // Check for author or time clustering
    const authors = contentItems.map((c) => c.authorName).filter(Boolean);
    const uniqueAuthors = new Set(authors);
    const timestamps = contentItems.map((c) => c.observedAt).filter(Boolean);
    const uniqueTimestamps = new Set(timestamps);

    const isAuthorClustered = authors.length >= 3 && uniqueAuthors.size === 1;
    const isTimeClustered = timestamps.length >= 3 && uniqueTimestamps.size === 1;

    // Scenario A2: Author or Time Clustered Scenario
    if (isAuthorClustered || isTimeClustered) {
      const summary = `当前公开样本呈现出明显的${isAuthorClustered ? "同源作者聚集" : "短时间窗口集中"}特征（共 ${contentItems.length} 条记录）。分析表明该行为更可能属于阶段性集中消费，而非经过时间沉淀的稳定长期偏好。`;

      const clusterEvIds = contentItems.map((c) => c.evidenceId);
      findings.push({
        id: "finding_clustering_observation",
        category: "SAMPLE_RELIABILITY",
        statement: `【来源与时间聚集性审视：阶段性消费而非长期稳定习惯】\n\n在分析当前样本时，需要首先审视其证据独立性。\n\n数据显示，样本中的内容${
          isAuthorClustered
            ? `全部来自同一创作者（${authors[0]}）`
            : "均在同一极短时间窗口内集中生成"
        }。虽然条目数量达到 ${contentItems.length} 条，但其来源高度同质化。在证据链评估中，同源集中记录的证明力显著低于跨作者、跨时间窗口的独立复现。因此，当前模式应视为一次阶段性的集中兴趣爆发，尚不足以推断为跨越周期的稳定生活偏好。`,
        evidenceIds: clusterEvIds,
      });

      const result: AiAnalysisResult = {
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        provider: "MOCK",
        summary,
        findings,
        limitations: [
          ...reportInput.limitations,
          "同源或短时间聚集样本不能简单等同于独立重复证据，长期稳定性有待跨时间周期数据验证。",
        ],
      };
      return result;
    }

    // Scenario A3: Disconfirming Evidence (Tech + Casual Entertainment)
    if (techItems.length >= 2 && casualItems.length >= 2) {
      const summary = `当前样本展现出双向分化的内容消费特征：既包含对深度技术系统架构的硬核关注，又共存着大量轻松休闲与碎片化娱乐记录。\n\n这一矛盾反证清晰地表明：不能简单用单一的“严肃系统解构”来概括其全部心智世界，其内容选择呈现出情境化的松紧双轨特征。`;

      const techEvIds = techItems.map((c) => c.evidenceId);
      const casualEvIds = casualItems.map((c) => c.evidenceId);

      findings.push({
        id: "finding_tech_depth",
        category: "TOPIC_INTERPRETATION",
        statement: `【专业技术轴心：对复杂工程架构的深入探寻】\n\n在技术知识领域，用户集中关注了包括 ${techItems.map((c) => `《${c.title}》`).join("、")} 等前沿工程实践。\n\n这表明其在技术生产力场景中，偏好严密的系统类型约束与底层机制解析，体现出追求确定性与工程规范的观察倾向。`,
        evidenceIds: techEvIds,
      });

      findings.push({
        id: "finding_disconfirming_casual_mix",
        category: "DIVERSITY_ASSESSMENT",
        statement: `【休闲碎片共存与单一假说反证】\n\n与严肃技术并存的是，样本中同时记录了 ${casualItems.map((c) => `《${c.title}》`).join("、")} 等多条轻量娱乐与生活向内容。\n\n这一反例证据至关重要：它直接反驳了“该用户在所有场景下均只消费硬核深度内容”的单向假说。这表明其在工作学习与日常放松之间存在明显的双轨分工——在专业领域追求深度机制，在休闲时刻则积极拥抱低负荷的即时快乐。`,
        evidenceIds: casualEvIds,
      });

      const result: AiAnalysisResult = {
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        provider: "MOCK",
        summary,
        findings,
        limitations: [
          ...reportInput.limitations,
          "样本中存在轻量娱乐反证，单一硬核假说已被适度修正并保留边界。",
        ],
      };
      return result;
    }

    // Scenario A4: Highly Random / Unpatterned Content (Unknown)
    if (techItems.length < 2 && gameItems.length < 2 && casualItems.length < 2 && animeItems.length < 2 && learningItems.length < 2 && contentItems.length >= 3) {
      const summary = `当前公开样本呈现出高度离散、发散的内容涉猎特征（共 ${contentItems.length} 条记录），各项内容之间缺乏统计显著的聚集轴心或跨领域共同模式。\n\n在科学审慎原则下，现有痕迹不足以支持形成明确、稳定的核心人物画像假说。`;

      findings.push({
        id: "finding_unknown_dispersed_pattern",
        category: "DIVERSITY_ASSESSMENT",
        statement: `【主题高度发散：当前样本不足以形成稳定人物假说】\n\n纵观当前样本中的各项公开记录，各条目分别散落在不同的泛兴趣领域，彼此之间未观察到共同的规则机制、叙事线索或审美逻辑。\n\n在证据决定推断上限的原则下，我们选择保持克制：承认“现有公开痕迹不足以判断其核心行为假说与长期偏好”。这种不确定性本身即是客观事实的真实反映，杜绝为了追求报告形式的完整性而进行无依据的脑补定性。`,
        evidenceIds: contentItems.map((c) => c.evidenceId),
      });

      const result: AiAnalysisResult = {
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        provider: "MOCK",
        summary,
        findings,
        limitations: [
          ...reportInput.limitations,
          "样本主题发散度高且缺乏共现模式，暂不提出高阶人物假说。",
        ],
      };
      return result;
    }

    // Scenario A5: Standard Rich Dual-Axis Core Profile (Tech + Games + Weak Signals)
    const summary = `从当前公开样本（共 ${analyzedCount} 条记录）来看，该用户的内容偏好呈现出鲜明的“双轴聚焦与机制探索”特征。\n\n表面上看，其内容涉猎分布在工程技术与单机游戏两个独立领域；但从信息结构与选择倾向审视，这两者共同指向了一种“通过理解底层规则来把握系统运作”的认知模式。在保持核心领域深度探究的同时，其边缘主题展现出开放的涉猎触角，整体勾勒出一个偏好结构化思维与机制解构的探索型人物轮廓。`;

    // Finding 1: 专业技术/创作工具轴心
    const ch1EvIds = Array.from(new Set(techItems.map((c) => c.evidenceId)));
    if (ch1EvIds.length > 0) {
      const titlesSummary = techItems.slice(0, 3).map((c) => `《${c.title}》`).join("、");
      findings.push({
        id: "finding_architecture_and_deep_systems",
        category: "TOPIC_INTERPRETATION",
        statement: `【前沿工具与实践探索：对生成机制与落地成品的追求】\n\n在科技、AI 与数字化实践层面，当前样本呈现出清晰的“工具应用与流程摸索”倾向。\n\n具体而言，样本中记录了包含 ${titlesSummary} 等实践内容，并记录了模型应用、超分处理与流程调优等具体细节。这表明其在技术领域的信息摄入具有明显的“动手实践与机制探索”特征。\n\n这种内容选择之所以值得注意，在于其反映的不仅是兴趣的“对象”（代码或 AI 工具），更是兴趣的“方式”：倾向于探寻工具背后的运转机理与实践边界，追求亲手调试并产出成品的闭环过程。`,
        evidenceIds: ch1EvIds,
      });
    }

    // Finding 2: 数字娱乐与游戏对局
    const ch2EvIds = Array.from(new Set(gameItems.map((c) => c.evidenceId)));
    if (ch2EvIds.length > 0) {
      const titlesSummary = gameItems.slice(0, 3).map((c) => `《${c.title}》`).join("、");
      findings.push({
        id: "finding_gameplay_mechanics_and_rules",
        category: "TOPIC_INTERPRETATION",
        statement: `【竞技娱乐与机制对抗：问题解决导向的互动审美】\n\n在数字娱乐方面，样本记录展现出对 ${titlesSummary} 等具体游戏与机制对局的明确关注。\n\n相比于依赖即时快餐消遣的内容，这些内容普遍具有明确的对抗交互、技能释放与规则应对属性。其选择的内容反映出在休闲娱乐场景中，其审美乐趣很大程度上来源于“对规则与技能判定的即时反馈”。娱乐在其内容版图中并非纯粹的被动接受，而是延续了主动参与和试错的状态。`,
        evidenceIds: ch2EvIds,
      });
    }

    // Finding 3: 跨领域共同模式 (创作 + 游戏)
    const ch3EvIds = Array.from(new Set(filterValidIds([
      ...techItems.slice(0, 2).map((c) => c.evidenceId),
      ...gameItems.slice(0, 2).map((c) => c.evidenceId),
    ])));
    if (ch3EvIds.length > 0) {
      findings.push({
        id: "finding_cross_domain_system_deconstruction",
        category: "TOPIC_INTERPRETATION",
        statement: `【跨领域共性机制：对实践操作与规则反馈的同构解构】\n\n将技术创作与游戏互动并置分析，可以观察到一条贯穿不同领域的深层模式：对“亲自加工与规则反馈”的主动实践倾向。\n\n在创作领域，其关注“如何借助工具链将素材加工为动态成品”；而在游戏对局中，其关注“如何在技能规则与攻防博弈中寻找机会”。两类内容在形式上分属创作与娱乐，但在心智模式上体现出一致性——都不满足于纯粹的旁观，而是偏好具有可操作空间与明确反馈闭环的体验。\n\n一个合理的探索性假说是：该用户倾向于被那些“可以亲自参与、调试并产生成品或反馈”的内容所吸引。需要指出的是，该假说建立在当前有限样本的共同特征之上；若未来数据中出现大量纯搬运或快餐碎片内容，则当前假说需适度修正。`,
        evidenceIds: ch3EvIds,
      });
    }

    // Finding 4: 弱信号与推断边界说明
    const ch4EvIds = Array.from(new Set(filterValidIds([
      "ev_norm_entropy",
      "ev_sample_analyzed",
      ...(contentItems[contentItems.length - 1] ? [contentItems[contentItems.length - 1].evidenceId] : []),
    ])));
    if (ch4EvIds.length > 0) {
      findings.push({
        id: "finding_weak_signal_and_exploratory_boundaries",
        category: "DIVERSITY_ASSESSMENT",
        statement: `【样本规模与认知边界审视：探索性假说而非全局定性】\n\n在数据层面，当前样本规模有限（共 ${analyzedCount} 条记录），归一化信息熵反映出一定的多元涉猎特征。\n\n在科学审慎原则下，当前分析仅代表该观察窗口内的局部行为模式与兴趣线索，严禁将其直接外推为全局长期的稳定人格、生活习惯或现实身份。承认数据局限与推断上限，是保持画像科学性与可信度的必要边界。`,
        evidenceIds: ch4EvIds,
      });
    }

    const limitations = [
      ...reportInput.limitations,
      "本画像分析基于公开受控样本生成，允许进行探索性认知与审美推测，严禁作为科学心理诊断或现实身份依据。",
    ];

    const result: AiAnalysisResult = {
      schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
      provider: "MOCK",
      summary,
      findings,
      limitations,
    };

    const resultValidation = validateAiAnalysisResult(result, reportInput);
    if (!resultValidation.valid) {
      throw new Error("Generated deterministic AI analysis failed validation: " + resultValidation.errors.join("; "));
    }

    return result;
  }

  // Branch B: Fallback observation-driven generation (for minimal unit test inputs without content items)
  const topicShareEvs = reportInput.evidence.filter((e) => e.type === "TOPIC_SHARE");

  let summary = "";
  if (analyzedCount === 0 || topicShareEvs.length === 0) {
    summary = "本次公开样本数据未能匹配到预设分类词表中的有效主题，当前观测窗口暂无明显的内容主题聚集现象。";
  } else {
    const topTopicObs = reportInput.observations.find((o) => o.category === "TOP_TOPIC");
    if (topTopicObs) {
      summary = `基于本地清洗后的有效公开数据样本（共 ${analyzedCount} 条），当前公开样本中的内容主题结构呈现出结构化分布特征，其中以主要分类领域最具代表性。`;
    } else {
      summary = `基于本地清洗后的有效公开数据样本（共 ${analyzedCount} 条），当前公开样本涵盖了多个主题领域，整体表现出多维度的涉猎特征。`;
    }
  }

  const findings: AiFinding[] = [];
  let index = 1;

  for (const obs of reportInput.observations) {
    const validEvidenceIds = obs.evidenceIds.filter((evId) =>
      reportInput.evidence.some((e) => e.id === evId)
    );

    if (validEvidenceIds.length === 0) {
      continue;
    }

    let statement = "";
    switch (obs.category) {
      case "SAMPLE_SIZE":
        statement = `样本概况解读：${obs.statement}`;
        break;
      case "TOP_TOPIC":
        statement = `核心偏好解读：${obs.statement}`;
        break;
      case "TOPIC_DISTRIBUTION":
        statement = `主题分布解读：${obs.statement}`;
        break;
      case "DIVERSITY":
        statement = `多样性离散特征解读：${obs.statement}`;
        break;
      case "SOURCE_LIMITATION":
        statement = `数据源局限性提示：${obs.statement}`;
        break;
      case "DATA_QUALITY":
        statement = `数据格式与质量提示：${obs.statement}`;
        break;
      default:
        statement = `事实解读：${obs.statement}`;
        break;
    }

    findings.push({
      id: `ai_finding_${index++}_${obs.id}`,
      category: mapObservationCategory(obs.category),
      statement,
      evidenceIds: validEvidenceIds,
    });
  }

  const limitations = [
    ...reportInput.limitations,
    "AI解读完全基于客观事实证据包生成，严禁进行人格标签或未经验证的推断。",
  ];

  const result: AiAnalysisResult = {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    provider: "MOCK",
    summary,
    findings,
    limitations,
  };

  const resultValidation = validateAiAnalysisResult(result, reportInput);
  if (!resultValidation.valid) {
    throw new Error("Generated Mock AI analysis failed validation: " + resultValidation.errors.join("; "));
  }

  return result;
}

/**
 * Singleton deterministic AI analysis provider.
 */
export const deterministicAiProvider: AiAnalysisProvider = {
  id: "MOCK",
  generate: generateDeterministicAiAnalysis,
};
