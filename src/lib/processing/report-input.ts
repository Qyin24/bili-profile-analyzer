/**
 * BiliProfile Analyzer — Phase 5.2.2: Deterministic Report Input & Evidence Package Builder
 *
 * Transforms DeterministicAnalysisResult into a structured, verifiable, and safe
 * DeterministicReportInput for future report generation or AI consumption.
 *
 * Rules:
 * - Pure functions only (zero fetch, zero DB, zero UI, zero LLM).
 * - Every observation is backed by at least one valid evidence entry.
 * - Neutral, factual phrasing only (zero personality or sensitive inferences).
 * - Zero propagation of uncontrolled warning messages, raw body text, or self-profile leaks.
 * - Distinguishes SOURCE_LIMITATION (source availability) from DATA_QUALITY (general format/quality).
 * - Strict whitelist and scalar validation.
 */

import {
  DeterministicAnalysisResult,
  DeterministicReportInput,
  ReportObservation,
  ReportEvidence,
  ReportDiagnosticsSummary,
  ReportInputValidationResult,
  REPORT_INPUT_SCHEMA_VERSION,
  VALID_OBSERVATION_CATEGORIES,
  VALID_EVIDENCE_TYPES,
  ObservationCategory,
  EvidenceType,
} from "@/types/processing";

/**
 * Local static mapping of known warning codes to neutral, controlled descriptions.
 * Never falls back to raw message strings.
 */
const KNOWN_WARNING_STATEMENTS: Record<string, string> = {
  INVALID_OBSERVED_AT: "部分记录的时间格式非法，已自动归一化为 null 处理",
  SOURCE_DATA_PARTIAL: "数据源包含部分受限记录 (PARTIAL)",
  SOURCE_DATA_UNAVAILABLE: "数据源包含不可用记录 (UNAVAILABLE)",
  INCOMPLETE_SOURCE_DATA: "数据源包含受限或不完整的记录",
  INVALID_SOURCE_TYPE: "数据源包含未知或非法的来源类型",
  INVALID_AVAILABILITY: "数据源包含非法的可用性状态值",
};

/**
 * Builds a deterministic, evidence-backed report input package from analysis results.
 */
export function buildDeterministicReportInput(
  result: DeterministicAnalysisResult
): DeterministicReportInput {
  const evidenceMap = new Map<string, ReportEvidence>();
  const observations: ReportObservation[] = [];

  // Helper to add evidence safely ensuring unique IDs
  function addEvidence(ev: ReportEvidence): string {
    evidenceMap.set(ev.id, ev);
    return ev.id;
  }

  // -------------------------------------------------------------------------
  // 1. Sample Size & Input Overview
  // -------------------------------------------------------------------------
  const totalInput = result.recordCounts.totalInput;
  const analyzedCount = result.recordCounts.analyzed;
  const unclassifiedCount = result.recordCounts.unclassified;

  const evSampleTotal = addEvidence({
    id: "ev_sample_total",
    type: "SAMPLE_COUNT",
    label: "输入记录总数",
    value: totalInput,
    unit: "条",
    sourceKey: "recordCounts.totalInput",
  });

  const evSampleAnalyzed = addEvidence({
    id: "ev_sample_analyzed",
    type: "SAMPLE_COUNT",
    label: "有效分析记录数",
    value: analyzedCount,
    unit: "条",
    sourceKey: "recordCounts.analyzed",
  });

  observations.push({
    id: "obs_sample_size",
    category: "SAMPLE_SIZE",
    statement: `本次流水线共接收 ${totalInput} 条输入记录，其中 ${analyzedCount} 条产生有效主题匹配并进入主题统计。`,
    evidenceIds: [evSampleTotal, evSampleAnalyzed],
    scopeNote: "基于本地清洗后有效公开数据样本",
  });

  // -------------------------------------------------------------------------
  // 2. Topic Distribution & Top Topics
  // -------------------------------------------------------------------------
  if (result.topicDistribution.length > 0) {
    const topicEvIds: string[] = [];

    for (const topic of result.topicDistribution) {
      const evId = addEvidence({
        id: `ev_topic_${topic.topicId}`,
        type: "TOPIC_SHARE",
        label: `${topic.topicName}类主题匹配占比`,
        value: topic.share,
        unit: "比例（0–1）",
        sourceKey: `topicDistribution[${topic.topicId}].share`,
      });
      topicEvIds.push(evId);
    }

    // Top Topic Observation
    const topTopic = result.topTopics[0] ?? result.topicDistribution[0];
    const topSharePct = (topTopic.share * 100).toFixed(2);
    const evTopTopicShare = addEvidence({
      id: "ev_top_topic_share",
      type: "METRIC",
      label: "最高主题匹配占比",
      value: topTopic.share,
      unit: "比例（0–1）",
      sourceKey: "diversityMetrics.topTopicShare",
    });

    observations.push({
      id: "obs_top_topic",
      category: "TOP_TOPIC",
      statement: `在本次有效主题匹配中，出现频次最高的主题为【${topTopic.topicName}】，占比为 ${topSharePct}%（共 ${topTopic.recordCount} 次匹配）。`,
      evidenceIds: [`ev_topic_${topTopic.topicId}`, evTopTopicShare],
      scopeNote: "以全部主题匹配数为统计分母",
    });

    // Topic Distribution Summary Observation
    const distSummaryStr = result.topicDistribution
      .map((t) => `${t.topicName}(${(t.share * 100).toFixed(2)}%)`)
      .join("、");

    observations.push({
      id: "obs_topic_distribution",
      category: "TOPIC_DISTRIBUTION",
      statement: `公开内容主题涵盖 ${distSummaryStr}。`,
      evidenceIds: topicEvIds,
      scopeNote: "多主题独立匹配统计",
    });

    // Diversity Metrics
    const evNormEntropy = addEvidence({
      id: "ev_norm_entropy",
      type: "METRIC",
      label: "归一化信息熵",
      value: result.diversityMetrics.normalizedEntropy,
      sourceKey: "diversityMetrics.normalizedEntropy",
    });

    const evDiversityLevel = addEvidence({
      id: "ev_diversity_level",
      type: "METRIC",
      label: "多样性离散等级",
      value: result.diversityMetrics.diversityLevel,
      sourceKey: "diversityMetrics.diversityLevel",
    });

    const evShannonEntropy = addEvidence({
      id: "ev_shannon_entropy",
      type: "METRIC",
      label: "香农信息熵",
      value: result.diversityMetrics.shannonEntropy,
      sourceKey: "diversityMetrics.shannonEntropy",
    });

    let diversityStatement = "";
    switch (result.diversityMetrics.diversityLevel) {
      case "INSUFFICIENT_DATA":
        diversityStatement = `有效记录样本数少于 ${result.diversityMetrics.minimumRecordThreshold} 条，标记为数据不足，暂不评定主题离散程度。`;
        break;
      case "HIGH":
        diversityStatement = `主题分布归一化信息熵为 ${result.diversityMetrics.normalizedEntropy}，内容涉猎较为分散多元（评级：HIGH）。`;
        break;
      case "MEDIUM":
        diversityStatement = `主题分布归一化信息熵为 ${result.diversityMetrics.normalizedEntropy}，内容表现出适度的领域聚焦与扩散（评级：MEDIUM）。`;
        break;
      case "LOW":
      default:
        diversityStatement = `主题分布归一化信息熵为 ${result.diversityMetrics.normalizedEntropy}，内容高度集中于单一或少数核心主题（评级：LOW）。`;
        break;
    }

    observations.push({
      id: "obs_diversity",
      category: "DIVERSITY",
      statement: diversityStatement,
      evidenceIds: [evNormEntropy, evDiversityLevel, evShannonEntropy],
      scopeNote: "基于香农信息熵客观计算，不含人格或心理推断",
    });
  } else {
    // Zero Topics Matched Observation
    const evNoTopic = addEvidence({
      id: "ev_no_topic_matched",
      type: "METRIC",
      label: "有效主题匹配数",
      value: 0,
      unit: "项",
      sourceKey: "topicDistribution.length",
    });

    observations.push({
      id: "obs_no_topic",
      category: "TOPIC_DISTRIBUTION",
      statement: "未匹配到预设分类词表中的有效主题，无法形成主题分布结论。",
      evidenceIds: [evNoTopic],
      scopeNote: "严格基于词表零幻觉匹配",
    });
  }

  // -------------------------------------------------------------------------
  // 3. Source Status Limitations (Availability only)
  // -------------------------------------------------------------------------
  const sourceLimitationEvidenceIds: string[] = [];

  // Track partial or unavailable source counts
  for (const st of ["PROFILE", "FOLLOW", "CONTENT"] as const) {
    const stats = result.diagnostics.sourceTypeStats[st];
    if (stats) {
      if (stats.partial > 0) {
        const evId = addEvidence({
          id: `ev_source_partial_${st.toLowerCase()}`,
          type: "SOURCE_STATUS",
          label: `${st}部分受限记录数`,
          value: stats.partial,
          unit: "条",
          sourceKey: `diagnostics.sourceTypeStats.${st}.partial`,
        });
        sourceLimitationEvidenceIds.push(evId);
      }
      if (stats.unavailable > 0) {
        const evId = addEvidence({
          id: `ev_source_unavail_${st.toLowerCase()}`,
          type: "SOURCE_STATUS",
          label: `${st}不可用记录数`,
          value: stats.unavailable,
          unit: "条",
          sourceKey: `diagnostics.sourceTypeStats.${st}.unavailable`,
        });
        sourceLimitationEvidenceIds.push(evId);
      }
    }
  }

  // Generate SOURCE_LIMITATION only when source availability is restricted
  if (sourceLimitationEvidenceIds.length > 0) {
    observations.push({
      id: "obs_source_limitation",
      category: "SOURCE_LIMITATION",
      statement:
        "本次分析包含部分受限或不可用的数据源记录，可能导致特定维度的公开特征观察不完整。",
      evidenceIds: sourceLimitationEvidenceIds,
      scopeNote: "受限数据源可用性客观记录",
    });
  }

  // -------------------------------------------------------------------------
  // 4. Data Quality & Format Normalization Warnings (Separate DATA_QUALITY)
  // -------------------------------------------------------------------------
  const qualityWarningEvidenceIds: string[] = [];

  for (const w of result.diagnostics.qualityWarnings) {
    // Only store stable code in value; never copy w.message
    const evId = addEvidence({
      id: `ev_warn_${w.code.toLowerCase()}`,
      type: "QUALITY_WARNING",
      label: `质量警告[${w.code}]`,
      value: w.code,
      sourceKey: `diagnostics.qualityWarnings.${w.code}`,
    });
    qualityWarningEvidenceIds.push(evId);
  }

  // Generate DATA_QUALITY observation when general quality warnings exist
  if (qualityWarningEvidenceIds.length > 0) {
    const warningStatements = Array.from(
      new Set(
        result.diagnostics.qualityWarnings.map(
          (w) => KNOWN_WARNING_STATEMENTS[w.code] ?? "存在未分类数据质量警告"
        )
      )
    );

    observations.push({
      id: "obs_data_quality",
      category: "DATA_QUALITY",
      statement: `数据处理过程中记录了质量与格式归一化提示：${warningStatements.join("；")}。`,
      evidenceIds: qualityWarningEvidenceIds,
      scopeNote: "数据质量与格式归一化客观记录",
    });
  }

  // -------------------------------------------------------------------------
  // 5. Neutral Limitations Statements
  // -------------------------------------------------------------------------
  const limitations: string[] = [
    "分析结论仅基于已归一化的公开样本数据，不代表用户全貌或私密偏好。",
    `主题分类基于固定词表（版本：${result.taxonomyVersion || "1.0.0"}），未收录的专业或生僻领域保持未分类。`,
  ];

  if (unclassifiedCount > 0) {
    limitations.push(
      `共有 ${unclassifiedCount} 条有效文本记录未命中预设主题词表，未强行归类。`
    );
  }

  const hasPartialOrUnavailable = (
    ["PROFILE", "FOLLOW", "CONTENT"] as const
  ).some(
    (st) =>
      (result.diagnostics.sourceTypeStats[st]?.partial ?? 0) > 0 ||
      (result.diagnostics.sourceTypeStats[st]?.unavailable ?? 0) > 0
  );

  if (hasPartialOrUnavailable) {
    limitations.push("存在部分受限或不可用的数据来源，已在质量诊断中如实记录。");
  }

  if (result.diagnostics.qualityWarnings.some((w) => w.code === "INVALID_OBSERVED_AT")) {
    limitations.push("部分来源记录缺少有效时间戳，相关时间线特征可能不完整。");
  }

  if (!result.diversityMetrics.isSufficientData) {
    limitations.push(
      `有效样本数量低于门槛（${result.diversityMetrics.minimumRecordThreshold}条），多样性结论置信度受限。`
    );
  }

  limitations.push("本系统严禁推断个体MBTI、政治、宗教、身心健康等任何敏感属性。");

  // -------------------------------------------------------------------------
  // 6. Diagnostics Summary
  // -------------------------------------------------------------------------
  const diagnosticsSummary: ReportDiagnosticsSummary = {
    totalInput,
    analyzedCount,
    unclassifiedCount,
    hasQualityWarnings: result.diagnostics.qualityWarnings.length > 0,
    warningCodes: result.diagnostics.qualityWarnings.map((w) => w.code),
  };

  return {
    schemaVersion: REPORT_INPUT_SCHEMA_VERSION,
    taxonomyVersion: result.taxonomyVersion || "1.0.0",
    observations,
    evidence: Array.from(evidenceMap.values()),
    limitations,
    diagnosticsSummary,
  };
}

/**
 * Validates a DeterministicReportInput for contract conformity, dangling references,
 * non-finite numbers, duplicate IDs, and zero sensitive leaks.
 */
export function validateDeterministicReportInput(
  input: unknown
): ReportInputValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["报告输入对象必须为非空对象"] };
  }

  const report = input as DeterministicReportInput;

  // 1. schemaVersion check
  if (report.schemaVersion !== REPORT_INPUT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion 非法: 预期 '${REPORT_INPUT_SCHEMA_VERSION}', 实际得到 '${String(report.schemaVersion)}'`
    );
  }

  // 2. taxonomyVersion check
  if (typeof report.taxonomyVersion !== "string" || !report.taxonomyVersion.trim()) {
    errors.push("taxonomyVersion 必须为有效非空字符串");
  }

  // 3. Evidence validation
  const seenEvIds = new Set<string>();
  if (!Array.isArray(report.evidence)) {
    errors.push("evidence 必须为数组");
  } else {
    for (let i = 0; i < report.evidence.length; i++) {
      const ev = report.evidence[i];
      if (!ev || typeof ev !== "object") {
        errors.push(`evidence[${i}] 必须为有效对象`);
        continue;
      }
      if (typeof ev.id !== "string" || !ev.id.trim()) {
        errors.push(`evidence[${i}].id 必须为非空字符串`);
      } else if (seenEvIds.has(ev.id)) {
        errors.push(`存在重复的 evidence id: '${ev.id}'`);
      } else {
        seenEvIds.add(ev.id);
      }

      // EvidenceType whitelist check
      if (
        typeof ev.type !== "string" ||
        !VALID_EVIDENCE_TYPES.includes(ev.type as EvidenceType)
      ) {
        errors.push(
          `evidence[${i}] (${ev.id || i}) 的 type '${String(ev.type)}' 非法，不在白名单中`
        );
      }

      if (typeof ev.label !== "string" || !ev.label.trim()) {
        errors.push(`evidence[${i}].label 必须为非空字符串`);
      }

      // Value strict validation
      if (ev.value === null || ev.value === undefined) {
        errors.push(`evidence[${i}] (${ev.id || i}) 的 value 为 null 或 undefined`);
      } else if (typeof ev.value === "object") {
        errors.push(
          `evidence[${i}] (${ev.id || i}) 的 value 必须为标量，不允许为对象或数组`
        );
      } else if (typeof ev.value === "number") {
        if (isNaN(ev.value) || !isFinite(ev.value)) {
          errors.push(`evidence[${i}] (${ev.id || i}) 的 value 为非有限数值 (NaN 或 Infinity)`);
        }
      } else if (typeof ev.value !== "string" && typeof ev.value !== "boolean") {
        errors.push(
          `evidence[${i}] (${ev.id || i}) 的 value 类型非法: '${typeof ev.value}'`
        );
      }

      // Optional unit & sourceKey strict string validation
      if (ev.unit !== undefined && typeof ev.unit !== "string") {
        errors.push(`evidence[${i}] (${ev.id || i}) 的 unit 必须为字符串`);
      }
      if (ev.sourceKey !== undefined && typeof ev.sourceKey !== "string") {
        errors.push(`evidence[${i}] (${ev.id || i}) 的 sourceKey 必须为字符串`);
      }
    }
  }

  // 4. Observation validation
  if (!Array.isArray(report.observations)) {
    errors.push("observations 必须为数组");
  } else {
    const seenObsIds = new Set<string>();
    for (let i = 0; i < report.observations.length; i++) {
      const obs = report.observations[i];
      if (!obs || typeof obs !== "object") {
        errors.push(`observations[${i}] 必须为有效对象`);
        continue;
      }
      if (typeof obs.id !== "string" || !obs.id.trim()) {
        errors.push(`observations[${i}].id 必须为非空字符串`);
      } else if (seenObsIds.has(obs.id)) {
        errors.push(`存在重复的 observation id: '${obs.id}'`);
      } else {
        seenObsIds.add(obs.id);
      }

      // ObservationCategory whitelist check
      if (
        typeof obs.category !== "string" ||
        !VALID_OBSERVATION_CATEGORIES.includes(obs.category as ObservationCategory)
      ) {
        errors.push(
          `observations[${i}] (${obs.id || i}) 的 category '${String(obs.category)}' 非法，不在白名单中`
        );
      }

      if (typeof obs.statement !== "string" || !obs.statement.trim()) {
        errors.push(`observations[${i}].statement 必须为非空字符串`);
      }

      if (obs.scopeNote !== undefined && typeof obs.scopeNote !== "string") {
        errors.push(`observations[${i}] (${obs.id || i}) 的 scopeNote 必须为字符串`);
      }

      if (!Array.isArray(obs.evidenceIds) || obs.evidenceIds.length === 0) {
        errors.push(
          `observations[${i}] (${obs.id || i}) 缺少 evidenceIds 或为空数组（不允许无证据观察）`
        );
      } else {
        for (const evId of obs.evidenceIds) {
          if (typeof evId !== "string") {
            errors.push(
              `observations[${i}] (${obs.id || i}) 的 evidenceId 必须为字符串`
            );
          } else if (!seenEvIds.has(evId)) {
            errors.push(
              `observations[${i}] (${obs.id || i}) 引用的 evidenceId '${evId}' 不存在于 evidence 列表中`
            );
          }
        }
      }
    }
  }

  // 5. Limitations validation
  if (!Array.isArray(report.limitations)) {
    errors.push("limitations 必须为数组");
  } else {
    for (let i = 0; i < report.limitations.length; i++) {
      if (typeof report.limitations[i] !== "string") {
        errors.push(`limitations[${i}] 必须为字符串`);
      }
    }
  }

  // 6. DiagnosticsSummary validation
  if (!report.diagnosticsSummary || typeof report.diagnosticsSummary !== "object") {
    errors.push("diagnosticsSummary 必须为有效对象");
  } else {
    const ds = report.diagnosticsSummary;
    if (typeof ds.totalInput !== "number" || isNaN(ds.totalInput) || !isFinite(ds.totalInput)) {
      errors.push("diagnosticsSummary.totalInput 必须为有限数值");
    }
    if (
      typeof ds.analyzedCount !== "number" ||
      isNaN(ds.analyzedCount) ||
      !isFinite(ds.analyzedCount)
    ) {
      errors.push("diagnosticsSummary.analyzedCount 必须为有限数值");
    }
    if (
      typeof ds.unclassifiedCount !== "number" ||
      isNaN(ds.unclassifiedCount) ||
      !isFinite(ds.unclassifiedCount)
    ) {
      errors.push("diagnosticsSummary.unclassifiedCount 必须为有限数值");
    }
    if (typeof ds.hasQualityWarnings !== "boolean") {
      errors.push("diagnosticsSummary.hasQualityWarnings 必须为布尔值");
    }
    if (!Array.isArray(ds.warningCodes)) {
      errors.push("diagnosticsSummary.warningCodes 必须为数组");
    } else {
      for (let i = 0; i < ds.warningCodes.length; i++) {
        if (typeof ds.warningCodes[i] !== "string") {
          errors.push(`diagnosticsSummary.warningCodes[${i}] 必须为字符串`);
        }
      }
    }
  }

  // 7. JSON serialization & Leakage check
  try {
    const serialized = JSON.stringify(report);
    if (!serialized || typeof serialized !== "string") {
      errors.push("报告输入对象无法序列化为 JSON 字符串");
    } else {
      const FORBIDDEN_TOKENS = [
        "SnapshotField",
        "currentGoals",
        "learningDirections",
        "customPrompt",
      ];
      for (const token of FORBIDDEN_TOKENS) {
        if (serialized.includes(token)) {
          errors.push(`报告输入对象包含未授权的自述或敏感字段标识: '${token}'`);
        }
      }
    }
  } catch (err: unknown) {
    errors.push(`JSON 序列化失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
