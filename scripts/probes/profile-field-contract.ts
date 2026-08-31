/**
 * BiliProfile Analyzer — Public Profile Field Contract & Offline Validator (Phase 4.5.1 Hardened)
 *
 * Natural Language Semantic Boundary (重要语义与边界说明):
 * 1. 字段级“已验证”(VERIFIED) 与能力级“可稳定使用”(AVAILABLE_PUBLIC) 是两个完全不同的结论。
 * 2. 字段达到 VERIFIED 仅代表在当前受控合成测试样本中，存在确定的结构锚点/元数据来源且值格式合法；
 * 3. 这绝不代表 BASIC_PROFILE 整体能力已达到生产环境稳定可用，亦不代表可以启动正式采集或写入数据库；
 * 4. 无论单个字段验证结果如何，当前整体能力状态 overallCapabilityStatus 均严格保持字面量 "UNVERIFIED"。
 * 5. 零敏感数据留存：绝不输出、保存或持久化原始 HTML、Cookie、响应头或任何密钥，错误提示严禁回显敏感值。
 * 6. 本模块的 evaluateSyntheticProfileFieldContract 仅用于离线测试夹具验证，绝非生产环境资料提取入口。
 */

import {
  PublicProfileFieldName,
  ProfileFieldContractStatus,
  FieldEvidenceSourceType,
  ProfileFieldEvidenceDescriptor,
  PositiveFieldEvidenceDescriptor,
  NoneFieldEvidenceDescriptor,
  PublicProfileFieldObservation,
  PublicProfileFieldContractRecord,
  ObservationSource,
} from "../../src/types/connector";

export const FIELD_CONTRACT_VERSION = "0.2.0-phase4.5.1-final-contract";

export const KNOWN_PROFILE_FIELD_NAMES: readonly PublicProfileFieldName[] = Object.freeze([
  "displayName",
  "signature",
  "avatarUrl",
  "verifiedLabel",
  "level",
]);

export const VALID_CONTRACT_STATUSES: readonly ProfileFieldContractStatus[] = Object.freeze([
  "VERIFIED",
  "UNVERIFIED",
  "UNAVAILABLE",
]);

export const VALID_EVIDENCE_SOURCE_TYPES: readonly FieldEvidenceSourceType[] = Object.freeze([
  "STRUCTURED_META_TAG",
  "DOM_SEMANTIC_ANCHOR",
  "CANONICAL_LINK",
  "SYNTHETIC_TEST_FIXTURE",
  "NONE",
]);

export const VALID_OBSERVATION_SOURCES: readonly ObservationSource[] = Object.freeze([
  "SYNTHETIC_OFFLINE_TEST",
  "CONTROLLED_LIVE_PROBE",
]);

export const ALLOWED_OBSERVATION_KEYS: readonly string[] = Object.freeze([
  "fieldName",
  "status",
  "value",
  "evidence",
  "failureReason",
]);

export const ALLOWED_RECORD_TOP_LEVEL_KEYS: readonly string[] = Object.freeze([
  "contractVersion",
  "observedAt",
  "source",
  "overallCapabilityStatus",
  "fields",
  "dataMinimizationGuaranteed",
]);

export const ALLOWED_EVIDENCE_KEYS: readonly string[] = Object.freeze([
  "evidenceType",
  "anchorIdentifier",
]);

export const SYNTHETIC_MAX_BYTES_CAP = 64 * 1024; // 65536 bytes hard ceiling
export const MAX_SCAN_DEPTH = 10; // Data minimization recursive depth ceiling

const CONTROL_CHARACTERS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const HTML_TAG_REGEX = /<[^>]+>/;
const ANGLE_BRACKETS_REGEX = /[<>]/;

/**
 * Validates a strict ISO 8601 calendar date and timestamp.
 * Rejects invalid calendar days like 2026-02-30 or 2026-04-31.
 */
export function validateStrictCalendarIsoDate(isoStr: unknown): { valid: boolean; error?: string } {
  if (typeof isoStr !== "string") {
    return { valid: false, error: "Timestamp must be a string" };
  }

  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
  const match = isoRegex.exec(isoStr);
  if (!match) {
    return { valid: false, error: "Timestamp must strictly match ISO 8601 format" };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const tz = match[8];

  if (year < 1970 || year > 9999) {
    return { valid: false, error: "Timestamp year is out of valid range" };
  }
  if (month < 1 || month > 12) {
    return { valid: false, error: "Timestamp month is out of valid calendar range (1..12)" };
  }

  // Days in month validation including leap years
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day < 1 || day > daysInMonth[month]) {
    return { valid: false, error: "Timestamp day is invalid for the specified calendar month" };
  }

  if (hour < 0 || hour > 23) {
    return { valid: false, error: "Timestamp hour is out of valid range (0..23)" };
  }
  if (minute < 0 || minute > 59) {
    return { valid: false, error: "Timestamp minute is out of valid range (0..59)" };
  }
  if (second < 0 || second > 59) {
    return { valid: false, error: "Timestamp second is out of valid range (0..59)" };
  }

  if (tz !== "Z") {
    const tzMatch = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
    if (!tzMatch) {
      return { valid: false, error: "Timestamp timezone offset format is invalid" };
    }
    const tzHour = parseInt(tzMatch[2], 10);
    const tzMin = parseInt(tzMatch[3], 10);
    if (tzHour > 14 || tzMin > 59) {
      return { valid: false, error: "Timestamp timezone offset is out of valid geographic range" };
    }
  }

  if (Number.isNaN(Date.parse(isoStr))) {
    return { valid: false, error: "Timestamp failed standard date parsing" };
  }

  return { valid: true };
}

/**
 * Validates the value of a specific profile field against its type and domain rules.
 * Error messages never echo user/untrusted input values.
 */
export function validateFieldValue(
  fieldName: PublicProfileFieldName,
  value: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (fieldName === "displayName" || fieldName === "signature" || fieldName === "verifiedLabel") {
    if (typeof value !== "string") {
      errors.push(`Field '${fieldName}' value must be a string`);
    } else {
      if (value.trim().length === 0) {
        errors.push(`Field '${fieldName}' value cannot be empty or whitespace only`);
      }
      if (CONTROL_CHARACTERS_REGEX.test(value)) {
        errors.push(`Field '${fieldName}' value contains forbidden control characters`);
      }
      if (HTML_TAG_REGEX.test(value) || ANGLE_BRACKETS_REGEX.test(value)) {
        errors.push(`Field '${fieldName}' value contains forbidden HTML markup or angle brackets`);
      }
    }
  } else if (fieldName === "avatarUrl") {
    if (typeof value !== "string") {
      errors.push("Field 'avatarUrl' value must be a string");
    } else {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        errors.push("Field 'avatarUrl' value cannot be empty");
      }
      if (CONTROL_CHARACTERS_REGEX.test(trimmed) || /\s/.test(trimmed)) {
        errors.push("Field 'avatarUrl' value contains forbidden control characters or whitespace");
      }
      if (ANGLE_BRACKETS_REGEX.test(trimmed)) {
        errors.push("Field 'avatarUrl' value contains forbidden angle brackets");
      }

      // Reject user:password@ credentials in URL
      if (/@/.test(trimmed)) {
        errors.push("Field 'avatarUrl' cannot contain embedded user credentials or '@' symbol");
      }

      // Protocol checks
      const isAllowedScheme =
        trimmed.startsWith("https://") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("//");

      if (!isAllowedScheme) {
        errors.push("Field 'avatarUrl' must use http, https, or protocol-relative URL");
      }

      const isForbiddenScheme =
        /^(javascript|data|ftp|file|vbscript|about|blob):/i.test(trimmed);
      if (isForbiddenScheme) {
        errors.push("Field 'avatarUrl' uses unsafe forbidden protocol scheme");
      }

      // Syntax check
      try {
        const urlToTest = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
        const parsed = new URL(urlToTest);
        if (!parsed.hostname || parsed.hostname.length < 3) {
          errors.push("Field 'avatarUrl' has invalid host");
        }
        if (parsed.username || parsed.password) {
          errors.push("Field 'avatarUrl' contains forbidden username or password credentials");
        }
      } catch {
        errors.push("Field 'avatarUrl' failed standard URL syntax parsing");
      }
    }
  } else if (fieldName === "level") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errors.push("Field 'level' value must be an integer");
    } else if (value < 0 || value > 6) {
      errors.push("Field 'level' value must be an integer between 0 and 6");
    }
  } else {
    errors.push("Unknown fieldName for value validation");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a structured evidence descriptor.
 * Error messages never echo untrusted inputs.
 */
export function validateEvidenceDescriptor(
  evidence: unknown,
  status: ProfileFieldContractStatus
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (status === "VERIFIED") {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      errors.push("VERIFIED field must contain a structured evidence object");
      return { valid: false, errors };
    }

    const desc = evidence as Record<string, unknown>;

    // Reject unknown keys in evidence descriptor
    for (const k of Object.keys(desc)) {
      if (!ALLOWED_EVIDENCE_KEYS.includes(k)) {
        errors.push("Unknown property detected in evidence descriptor");
      }
    }

    if (
      typeof desc.evidenceType !== "string" ||
      !VALID_EVIDENCE_SOURCE_TYPES.includes(desc.evidenceType as FieldEvidenceSourceType) ||
      desc.evidenceType === "NONE"
    ) {
      errors.push("VERIFIED field evidenceType must be an allowed positive enum type (cannot be 'NONE')");
    }

    if (typeof desc.anchorIdentifier !== "string" || desc.anchorIdentifier.trim().length === 0) {
      errors.push("VERIFIED field anchorIdentifier must be a non-empty string");
    } else {
      if (CONTROL_CHARACTERS_REGEX.test(desc.anchorIdentifier)) {
        errors.push("anchorIdentifier cannot contain control characters");
      }
      if (HTML_TAG_REGEX.test(desc.anchorIdentifier) || ANGLE_BRACKETS_REGEX.test(desc.anchorIdentifier)) {
        errors.push("anchorIdentifier cannot contain HTML tags or angle brackets");
      }
    }
  } else {
    // UNVERIFIED or UNAVAILABLE
    if (evidence !== undefined && evidence !== null) {
      if (typeof evidence !== "object" || Array.isArray(evidence)) {
        errors.push("Non-VERIFIED field evidence must be null, undefined, or a NONE evidence descriptor");
      } else {
        const desc = evidence as Record<string, unknown>;
        for (const k of Object.keys(desc)) {
          if (!ALLOWED_EVIDENCE_KEYS.includes(k)) {
            errors.push("Unknown property detected in evidence descriptor");
          }
        }
        if (desc.evidenceType !== "NONE") {
          errors.push("Non-VERIFIED field cannot forge positive evidenceType");
        }
        if (typeof desc.anchorIdentifier !== "string" || desc.anchorIdentifier !== "") {
          errors.push("NONE evidence descriptor must have an empty string anchorIdentifier");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a single public profile field observation against contract invariant rules.
 * Enforces discriminated union constraints and rejects unknown fields.
 */
export function validateFieldObservation(
  obs: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!obs || typeof obs !== "object" || Array.isArray(obs)) {
    return { valid: false, errors: ["Field observation must be a valid non-array object"] };
  }

  const record = obs as Record<string, unknown>;

  // 1. Unknown keys check on observation object
  for (const key of Object.keys(record)) {
    if (!ALLOWED_OBSERVATION_KEYS.includes(key)) {
      errors.push("Unknown property detected on field observation object");
    }
  }

  // 2. Field name check
  if (
    typeof record.fieldName !== "string" ||
    !KNOWN_PROFILE_FIELD_NAMES.includes(record.fieldName as PublicProfileFieldName)
  ) {
    errors.push("Invalid or unknown fieldName on observation");
  }

  // 3. Status check
  if (
    typeof record.status !== "string" ||
    !VALID_CONTRACT_STATUSES.includes(record.status as ProfileFieldContractStatus)
  ) {
    errors.push("Invalid or unknown status on observation");
  }

  const fieldName = record.fieldName as PublicProfileFieldName;
  const status = record.status as ProfileFieldContractStatus;

  // 4. Discriminated union rules
  if (status === "VERIFIED") {
    if (record.value === undefined || record.value === null) {
      errors.push(`VERIFIED field '${fieldName}' must carry a defined value`);
    } else if (KNOWN_PROFILE_FIELD_NAMES.includes(fieldName)) {
      const valCheck = validateFieldValue(fieldName, record.value);
      if (!valCheck.valid) {
        errors.push(...valCheck.errors);
      }
    }

    const evCheck = validateEvidenceDescriptor(record.evidence, status);
    if (!evCheck.valid) {
      errors.push(...evCheck.errors);
    }

    if (record.failureReason !== undefined && record.failureReason !== null) {
      errors.push(`VERIFIED field '${fieldName}' cannot carry a failureReason`);
    }
  } else {
    // UNVERIFIED or UNAVAILABLE
    if (record.value !== undefined && record.value !== null) {
      errors.push(`Non-VERIFIED field '${fieldName}' cannot carry a value`);
    }

    const evCheck = validateEvidenceDescriptor(record.evidence, status);
    if (!evCheck.valid) {
      errors.push(...evCheck.errors);
    }

    if (
      typeof record.failureReason !== "string" ||
      record.failureReason.trim().length === 0
    ) {
      errors.push(`Non-VERIFIED field '${fieldName}' must carry a non-empty failureReason`);
    } else {
      if (HTML_TAG_REGEX.test(record.failureReason) || ANGLE_BRACKETS_REGEX.test(record.failureReason)) {
        errors.push(`Field '${fieldName}' failureReason cannot contain HTML tags or angle brackets`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts data minimization compliance: recursively verifies that no raw HTML,
 * cookies, auth headers, database URIs, or secrets exist anywhere in the payload.
 * Safely handles circular references via WeakSet and limits scan depth.
 * Never echoes sensitive values in output error messages.
 */
export function assertDataMinimization(data: unknown): { clean: boolean; forbiddenFindings: string[] } {
  const forbiddenFindings: string[] = [];
  const visited = new WeakSet<object>();

  const FORBIDDEN_KEY_PATTERNS = [
    /raw_?html/i,
    /^html$/i,
    /response(_?body)?/i,
    /headers?/i,
    /cookie/i,
    /authorization/i,
    /token/i,
    /secret/i,
    /password/i,
    /^env$/i,
    /process_?env/i,
    /database_?url/i,
  ];

  function scan(val: unknown, path: string, depth: number) {
    if (val === null || val === undefined) return;

    if (depth > MAX_SCAN_DEPTH) {
      forbiddenFindings.push(`Exceeded maximum object recursion depth limit at ${path}`);
      return;
    }

    if (typeof val === "string") {
      // Check any HTML tags or elements
      if (/<[a-zA-Z\/][^>]*>|<!DOCTYPE|<html|<body|<script|<style/i.test(val)) {
        forbiddenFindings.push(`HTML markup pattern detected at ${path}`);
      }
      // Check cookies
      if (/SESSDATA|buvid|DedeUserID|bili_jct/i.test(val)) {
        forbiddenFindings.push(`Cookie credential pattern detected at ${path}`);
      }
      // Check auth tokens
      if (/Bearer\s+[a-zA-Z0-9_-]{8,}|token=[a-zA-Z0-9_-]{8,}/i.test(val)) {
        forbiddenFindings.push(`Auth token pattern detected at ${path}`);
      }
      // Check database connection strings
      if (/postgres(ql)?:\/\/|sqlite:\/\//i.test(val)) {
        forbiddenFindings.push(`Database connection URI detected at ${path}`);
      }
      // Check sensitive env keys
      if (/DATABASE_URL|BILIPROFILE_/i.test(val)) {
        forbiddenFindings.push(`Environment secret key detected at ${path}`);
      }
    } else if (typeof val === "object") {
      if (visited.has(val as object)) {
        // Circular reference safely skipped
        return;
      }
      visited.add(val as object);

      if (Array.isArray(val)) {
        val.forEach((item, index) => scan(item, `${path}[${index}]`, depth + 1));
      } else {
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          const currentPath = path ? `${path}.${k}` : k;

          // Key name scan
          if (FORBIDDEN_KEY_PATTERNS.some((p) => p.test(k))) {
            forbiddenFindings.push(`Forbidden key name detected at ${currentPath}`);
          }

          scan(v, currentPath, depth + 1);
        }
      }
    }
  }

  scan(data, "", 0);
  return {
    clean: forbiddenFindings.length === 0,
    forbiddenFindings,
  };
}

/**
 * Validates a full PublicProfileFieldContractRecord against all strict contract rules.
 * Rejects top-level unknown keys, strictly validates ISO timestamps and UNVERIFIED status.
 */
export function validateProfileFieldContractRecord(
  record: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["Record must be a non-null object"] };
  }

  const rec = record as Record<string, unknown>;

  // 1. Top-level unknown keys check
  for (const key of Object.keys(rec)) {
    if (!ALLOWED_RECORD_TOP_LEVEL_KEYS.includes(key)) {
      errors.push("Unknown top-level property detected on contract record");
    }
  }

  // 2. Contract version
  if (typeof rec.contractVersion !== "string" || rec.contractVersion.trim().length === 0) {
    errors.push("contractVersion is required and must be non-empty string");
  }

  // 3. Strict ISO calendar date check
  const dateCheck = validateStrictCalendarIsoDate(rec.observedAt);
  if (!dateCheck.valid) {
    errors.push(dateCheck.error || "observedAt is an invalid ISO 8601 calendar timestamp");
  }

  // 4. Source check
  if (
    typeof rec.source !== "string" ||
    !VALID_OBSERVATION_SOURCES.includes(rec.source as ObservationSource)
  ) {
    errors.push("source must be an allowed ObservationSource enum");
  }

  // 5. Capability invariant: overall capability MUST strictly remain literal 'UNVERIFIED'
  if (rec.overallCapabilityStatus !== "UNVERIFIED") {
    errors.push("overallCapabilityStatus must strictly remain literal 'UNVERIFIED'");
  }

  // 6. Data minimization flag
  if (rec.dataMinimizationGuaranteed !== true) {
    errors.push("dataMinimizationGuaranteed must be strictly true");
  }

  // 7. Fields map check
  if (!rec.fields || typeof rec.fields !== "object" || Array.isArray(rec.fields)) {
    errors.push("fields map is required and must be an object");
  } else {
    const fields = rec.fields as Record<string, unknown>;
    const presentKeys = Object.keys(fields);

    // Reject unknown keys in fields map
    for (const key of presentKeys) {
      if (!KNOWN_PROFILE_FIELD_NAMES.includes(key as PublicProfileFieldName)) {
        errors.push("Unknown field key detected in fields map");
      }
    }

    // Verify all 5 known fields exist and key matches fieldName
    for (const name of KNOWN_PROFILE_FIELD_NAMES) {
      const fieldObs = fields[name];
      if (!fieldObs) {
        errors.push(`Missing required field observation for '${name}'`);
      } else {
        const obsObj = fieldObs as Record<string, unknown>;
        if (obsObj.fieldName !== name) {
          errors.push(`fields map key does not match observation.fieldName for '${name}'`);
        }
        const fieldCheck = validateFieldObservation(fieldObs);
        if (!fieldCheck.valid) {
          errors.push(...fieldCheck.errors);
        }
      }
    }
  }

  // 8. Recursive data minimization check
  const minCheck = assertDataMinimization(rec);
  if (!minCheck.clean) {
    errors.push(...minCheck.forbiddenFindings);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Synthetic Test-Only Profile Field Evaluator.
 * 
 * Safety & Isolation Boundaries:
 * - SYNTHETIC FIXTURE EVALUATION ONLY: Strictly for offline test-suite validation; NOT a production profile extraction entrypoint.
 * - Source is permanently fixed to "SYNTHETIC_OFFLINE_TEST".
 * - Input is strictly clamped to SYNTHETIC_MAX_BYTES_CAP (64 KiB).
 * - Never outputs raw HTML, response headers, or full text.
 * - Bare <title> tags are strictly rejected from becoming VERIFIED displayName evidence.
 */
export function evaluateSyntheticProfileFieldContract(
  syntheticHtml: string
): PublicProfileFieldContractRecord {
  if (typeof syntheticHtml !== "string") {
    throw new Error("syntheticHtml must be a string");
  }

  // Hard byte cap clamp
  const encoder = new TextEncoder();
  const bytes = encoder.encode(syntheticHtml);
  let safeHtml = syntheticHtml;
  if (bytes.length > SYNTHETIC_MAX_BYTES_CAP) {
    const clampedBytes = bytes.slice(0, SYNTHETIC_MAX_BYTES_CAP);
    safeHtml = new TextDecoder("utf-8").decode(clampedBytes);
  }

  // 1. displayName
  let displayNameObs: PublicProfileFieldObservation<string>;
  const ogTitleMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(safeHtml) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(safeHtml);
  const hNameMatch = /<h[1-6][^>]*class=["'][^"']*h-name[^"']*["'][^>]*>([^<]+)<\/h[1-6]>/i.exec(safeHtml) ||
    /<span[^>]*id=["']h-name["'][^>]*>([^<]+)<\/span>/i.exec(safeHtml);

  if (ogTitleMatch && ogTitleMatch[1] && ogTitleMatch[1].trim().length > 0) {
    displayNameObs = {
      fieldName: "displayName",
      status: "VERIFIED",
      value: ogTitleMatch[1].trim(),
      evidence: {
        evidenceType: "STRUCTURED_META_TAG",
        anchorIdentifier: "og:title",
      },
    };
  } else if (hNameMatch && hNameMatch[1] && hNameMatch[1].trim().length > 0) {
    displayNameObs = {
      fieldName: "displayName",
      status: "VERIFIED",
      value: hNameMatch[1].trim(),
      evidence: {
        evidenceType: "DOM_SEMANTIC_ANCHOR",
        anchorIdentifier: "h1.h-name",
      },
    };
  } else {
    displayNameObs = {
      fieldName: "displayName",
      status: "UNVERIFIED",
      value: undefined,
      evidence: { evidenceType: "NONE", anchorIdentifier: "" },
      failureReason: /<title/i.test(safeHtml)
        ? "Title text alone without personal space structural anchor is insufficient for verified field extraction"
        : "Display name structural anchor not found in synthetic stream",
    };
  }

  // 2. signature
  let signatureObs: PublicProfileFieldObservation<string>;
  const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(safeHtml) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(safeHtml);
  const hSignMatch = /<div[^>]*class=["'][^"']*h-sign[^"']*["'][^>]*>([^<]+)<\/div>/i.exec(safeHtml) ||
    /<span[^>]*id=["']h-sign["'][^>]*>([^<]+)<\/span>/i.exec(safeHtml);

  if (descMatch && descMatch[1] && descMatch[1].trim().length > 0) {
    signatureObs = {
      fieldName: "signature",
      status: "VERIFIED",
      value: descMatch[1].trim(),
      evidence: {
        evidenceType: "STRUCTURED_META_TAG",
        anchorIdentifier: "meta.description",
      },
    };
  } else if (hSignMatch && hSignMatch[1] && hSignMatch[1].trim().length > 0) {
    signatureObs = {
      fieldName: "signature",
      status: "VERIFIED",
      value: hSignMatch[1].trim(),
      evidence: {
        evidenceType: "DOM_SEMANTIC_ANCHOR",
        anchorIdentifier: "div.h-sign",
      },
    };
  } else {
    signatureObs = {
      fieldName: "signature",
      status: "UNVERIFIED",
      value: undefined,
      evidence: { evidenceType: "NONE", anchorIdentifier: "" },
      failureReason: "Signature structural anchor not found in synthetic stream",
    };
  }

  // 3. avatarUrl
  let avatarUrlObs: PublicProfileFieldObservation<string>;
  const ogImgMatch = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(safeHtml) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(safeHtml);
  const hAvatarMatch = /<img[^>]*class=["'][^"']*h-avatar[^"']*["'][^>]*src=["']([^"']+)["']/i.exec(safeHtml);

  const rawAvatarCandidate = (ogImgMatch && ogImgMatch[1]) || (hAvatarMatch && hAvatarMatch[1]) || null;
  if (rawAvatarCandidate && rawAvatarCandidate.trim().length > 0) {
    const valCheck = validateFieldValue("avatarUrl", rawAvatarCandidate.trim());
    if (valCheck.valid) {
      avatarUrlObs = {
        fieldName: "avatarUrl",
        status: "VERIFIED",
        value: rawAvatarCandidate.trim(),
        evidence: {
          evidenceType: ogImgMatch ? "STRUCTURED_META_TAG" : "DOM_SEMANTIC_ANCHOR",
          anchorIdentifier: ogImgMatch ? "og:image" : "img.h-avatar",
        },
      };
    } else {
      avatarUrlObs = {
        fieldName: "avatarUrl",
        status: "UNVERIFIED",
        value: undefined,
        evidence: { evidenceType: "NONE", anchorIdentifier: "" },
        failureReason: "Avatar URL failed security protocol validation",
      };
    }
  } else {
    avatarUrlObs = {
      fieldName: "avatarUrl",
      status: "UNVERIFIED",
      value: undefined,
      evidence: { evidenceType: "NONE", anchorIdentifier: "" },
      failureReason: "Avatar URL structural anchor not found in synthetic stream",
    };
  }

  // 4. verifiedLabel
  let verifiedLabelObs: PublicProfileFieldObservation<string>;
  const verifiedMatch = /<span[^>]*class=["'][^"']*h-verified-text[^"']*["'][^>]*>([^<]+)<\/span>/i.exec(safeHtml) ||
    /<div[^>]*class=["'][^"']*user-auth-title[^"']*["'][^>]*>([^<]+)<\/div>/i.exec(safeHtml);

  if (verifiedMatch && verifiedMatch[1] && verifiedMatch[1].trim().length > 0) {
    verifiedLabelObs = {
      fieldName: "verifiedLabel",
      status: "VERIFIED",
      value: verifiedMatch[1].trim(),
      evidence: {
        evidenceType: "DOM_SEMANTIC_ANCHOR",
        anchorIdentifier: "span.h-verified-text",
      },
    };
  } else {
    verifiedLabelObs = {
      fieldName: "verifiedLabel",
      status: "UNAVAILABLE",
      value: undefined,
      evidence: { evidenceType: "NONE", anchorIdentifier: "" },
      failureReason: "Verified label structural anchor not present in public minimal stream",
    };
  }

  // 5. level
  let levelObs: PublicProfileFieldObservation<number>;
  const levelMatch = /<span[^>]*class=["'][^"']*h-level[^"']*["'][^>]+data-level=["']([0-6])["']/i.exec(safeHtml) ||
    /<i[^>]*class=["'][^"']*level-icon\s+level-([0-6])["']/i.exec(safeHtml);

  if (levelMatch && levelMatch[1]) {
    const num = parseInt(levelMatch[1], 10);
    levelObs = {
      fieldName: "level",
      status: "VERIFIED",
      value: num,
      evidence: {
        evidenceType: "DOM_SEMANTIC_ANCHOR",
        anchorIdentifier: "span.h-level[data-level]",
      },
    };
  } else {
    levelObs = {
      fieldName: "level",
      status: "UNAVAILABLE",
      value: undefined,
      evidence: { evidenceType: "NONE", anchorIdentifier: "" },
      failureReason: "Public level structural anchor not present in synthetic stream",
    };
  }

  return {
    contractVersion: FIELD_CONTRACT_VERSION,
    observedAt: new Date().toISOString(),
    source: "SYNTHETIC_OFFLINE_TEST",
    overallCapabilityStatus: "UNVERIFIED",
    fields: {
      displayName: displayNameObs,
      signature: signatureObs,
      avatarUrl: avatarUrlObs,
      verifiedLabel: verifiedLabelObs,
      level: levelObs,
    },
    dataMinimizationGuaranteed: true,
  };
}
