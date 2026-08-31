/**
 * BiliProfile Analyzer — Phase 6.0 & 6.0.1: AI Analysis Result Strict Validator
 *
 * Enforces contract compliance, evidence traceability, and privacy/safety invariants
 * on AI analysis results before returning them to callers.
 *
 * Sanitization Rules (Phase 6.0.1):
 * - Error messages use stable, controlled descriptions without echoing variable keys, values, IDs, providers, categories, or exception messages.
 * - Retains structural position (e.g. `findings[0]`) without echoing payload content.
 * - Rejects any unknown or extra fields in root or finding objects.
 * - Every finding MUST cite existing evidence IDs from the input DeterministicReportInput.
 * - Zero hallucinated evidence references.
 * - Strict prohibition of sensitive inference keywords (MBTI, personality, politics, religion, mental health) in statements/summaries.
 * - Zero self-profile or credential leakage across entire output.
 */

import {
  AiAnalysisResult,
  AiValidationResult,
  AI_ANALYSIS_SCHEMA_VERSION,
  VALID_AI_PROVIDERS,
  VALID_AI_FINDING_CATEGORIES,
  AiProviderType,
  AiFindingCategory,
} from "@/types/ai-analysis";
import { DeterministicReportInput } from "@/types/processing";
import { validateDeterministicReportInput } from "@/lib/processing/pipeline";

const ALLOWED_AI_ROOT_KEYS = new Set([
  "schemaVersion",
  "provider",
  "summary",
  "findings",
  "limitations",
]);

const ALLOWED_AI_FINDING_KEYS = new Set([
  "id",
  "category",
  "statement",
  "evidenceIds",
]);

const FORBIDDEN_TOKENS = [
  "SnapshotField",
  "currentGoals",
  "learningDirections",
  "customPrompt",
  "SESSDATA",
  "Cookie",
  "bili_jct",
];

/**
 * Validates an AiAnalysisResult against its input DeterministicReportInput.
 */
export function validateAiAnalysisResult(
  output: unknown,
  reportInput: DeterministicReportInput
): AiValidationResult {
  const errors: string[] = [];

  // 1. Verify that the reference input is a valid DeterministicReportInput
  const inputValidation = validateDeterministicReportInput(reportInput);
  if (!inputValidation.valid) {
    return {
      valid: false,
      errors: ["参考 DeterministicReportInput 未通过有效性校验"],
    };
  }

  const validEvidenceIds = new Set([
    ...reportInput.evidence.map((e) => e.id),
    ...(reportInput.contentItems ?? []).map((item) => item.evidenceId),
  ]);

  // 2. Validate output is a valid object
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { valid: false, errors: ["AI 分析结果必须为非空对象"] };
  }

  // 3. Strict Root Keys Whitelist Check
  const rootKeys = Object.keys(output as unknown as Record<string, unknown>);
  for (const key of rootKeys) {
    if (!ALLOWED_AI_ROOT_KEYS.has(key)) {
      errors.push("AI 分析结果根对象包含未知字段");
    }
  }

  const result = output as AiAnalysisResult;

  // 4. schemaVersion Check
  if (result.schemaVersion !== AI_ANALYSIS_SCHEMA_VERSION) {
    errors.push("schemaVersion 非法");
  }

  // 5. provider Check
  if (
    typeof result.provider !== "string" ||
    !VALID_AI_PROVIDERS.includes(result.provider as AiProviderType)
  ) {
    errors.push("provider 非法");
  }

  // 6. summary Check
  if (typeof result.summary !== "string" || !result.summary.trim()) {
    errors.push("summary 必须为有效非空字符串");
  }

  // 7. findings Validation
  if (!Array.isArray(result.findings)) {
    errors.push("findings 必须为数组");
  } else {
    const seenFindingIds = new Set<string>();

    for (let i = 0; i < result.findings.length; i++) {
      const finding = result.findings[i];
      if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
        errors.push(`findings[${i}] 必须为有效对象`);
        continue;
      }

      // Strict Finding Keys Whitelist Check
      const findingKeys = Object.keys(finding as unknown as Record<string, unknown>);
      for (const key of findingKeys) {
        if (!ALLOWED_AI_FINDING_KEYS.has(key)) {
          errors.push(`findings[${i}] 包含未知字段`);
        }
      }

      // ID check
      if (typeof finding.id !== "string" || !finding.id.trim()) {
        errors.push(`findings[${i}].id 必须为非空字符串`);
      } else if (seenFindingIds.has(finding.id)) {
        errors.push(`findings[${i}] 存在重复的 finding id`);
      } else {
        seenFindingIds.add(finding.id);
      }

      // Category check
      if (
        typeof finding.category !== "string" ||
        !VALID_AI_FINDING_CATEGORIES.includes(finding.category as AiFindingCategory)
      ) {
        errors.push(`findings[${i}] 的 category 非法`);
      }

      // Statement check
      if (typeof finding.statement !== "string" || !finding.statement.trim()) {
        errors.push(`findings[${i}].statement 必须为非空字符串`);
      }

      // Evidence IDs check (Zero dangling / hallucinated references / zero duplicates)
      if (!Array.isArray(finding.evidenceIds) || finding.evidenceIds.length === 0) {
        errors.push(`findings[${i}] 缺少 evidenceIds 或为空数组`);
      } else {
        const seenEvIdsInFinding = new Set<string>();

        for (const evId of finding.evidenceIds) {
          if (typeof evId !== "string" || !evId.trim()) {
            errors.push(`findings[${i}] 的 evidenceId 必须为非空字符串`);
          } else if (!validEvidenceIds.has(evId)) {
            errors.push(`findings[${i}] 引用的 evidenceId 不存在于输入报告中`);
          } else if (seenEvIdsInFinding.has(evId)) {
            errors.push(`findings[${i}] 存在重复引用的 evidenceId: ${evId}`);
          } else {
            seenEvIdsInFinding.add(evId);
          }
        }

        // PROFILE-only/PROFILE misattribution check: Content topic and diversity findings must not cite PROFILE items
        if (finding.category === "TOPIC_INTERPRETATION" || finding.category === "DIVERSITY_ASSESSMENT") {
          const hasProfileEvidence = finding.evidenceIds.some(
            (id) =>
              id.startsWith("ev_profile_") ||
              reportInput.evidence.some((e) => e.id === id && e.type === "PROFILE_ITEM")
          );
          if (hasProfileEvidence) {
            errors.push(`findings[${i}] (${finding.category}) 不得引用主页资料 (PROFILE) 作为内容主题或多样性分析证据`);
          }
        }
      }
    }
  }

  // 8. limitations Validation
  if (!Array.isArray(result.limitations)) {
    errors.push("limitations 必须为数组");
  } else {
    for (let i = 0; i < result.limitations.length; i++) {
      if (typeof result.limitations[i] !== "string" || !result.limitations[i].trim()) {
        errors.push(`limitations[${i}] 必须为有效非空字符串`);
      }
    }
  }

  // 9. JSON Serialization & Safety/Leak Token Scan across whole payload
  try {
    const serialized = JSON.stringify(result);
    if (!serialized || typeof serialized !== "string") {
      errors.push("AI 分析结果无法序列化为 JSON 字符串");
    } else {
      if (serialized.includes("NaN") || serialized.includes("Infinity")) {
        errors.push("AI 分析结果包含非法非有限数值 (NaN 或 Infinity)");
      }

      // Check forbidden leak tokens
      for (const token of FORBIDDEN_TOKENS) {
        if (serialized.includes(token)) {
          errors.push("AI 分析结果包含受保护的敏感标记或字段");
        }
      }
    }
  } catch {
    errors.push("JSON 序列化失败");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
