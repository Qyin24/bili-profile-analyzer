/**
 * BiliProfile Analyzer — Minimal BASIC_PROFILE Input Contract & Adapter
 *
 * Implements a platform-agnostic, strictly whitelisted input contract for public basic profiles.
 *
 * Guarantees & Invariants:
 * 1. Strict Root Key Whitelist:
 *    - Only allowed keys: recordId, provenance, displayName, description, tags, avatarIdentifier, observedAt, availability.
 *    - Any unknown top-level key fails validation.
 *    - No arbitrary nested objects allowed (only tags may be an array of strings).
 * 2. Strict Platform-Agnostic & Zero Leakage:
 *    - Explicitly blocks raw platform fields (e.g., mid, uname, face, sign, wbi, w_rid) and sensitive credentials (cookie, token, session).
 * 3. Declarative Provenance Label:
 *    - `provenance` is a declarative format marker ("LOCAL_FIXTURE" | "REAL_CONNECTOR").
 *    - In offline mode, "REAL_CONNECTOR" is a declarative label and does NOT imply proof of runtime authenticity.
 *    - `createLocalFixtureBasicProfileInput` factory sets `provenance: "LOCAL_FIXTURE"` upon creation.
 * 4. Strict Type & Date Semantics:
 *    - `observedAt` must be a valid ISO 8601 timestamp with an explicit timezone (e.g., 'Z' or '+08:00') or null.
 *    - Date-only strings (e.g., '2026-08-20') or timezone-less timestamps (e.g., '2026-08-20T12:00:00') are rejected.
 *    - String fields (displayName, description, avatarIdentifier, recordId) cannot be empty or whitespace-only.
 *    - Adapter performs explicit, non-destructive field mapping without `||` fallbacks.
 * 5. Batch Uniqueness Verification:
 *    - Single-record validator checks format.
 *    - `validateBasicProfileInputBatch` provides explicit batch-level recordId uniqueness checking.
 */

import {
  NormalizedBasicProfileInput,
  BasicProfileInputValidationResult,
  PublicSourceRecord,
} from "@/types/processing";

/**
 * Strict whitelist of allowed root property names for NormalizedBasicProfileInput.
 */
export const ALLOWED_BASIC_PROFILE_ROOT_KEYS: ReadonlySet<string> = new Set([
  "recordId",
  "provenance",
  "displayName",
  "description",
  "tags",
  "avatarIdentifier",
  "observedAt",
  "availability",
]);

/**
 * Explicitly forbidden platform-specific or credential property names.
 */
export const FORBIDDEN_RAW_KEYS: ReadonlySet<string> = new Set([
  "mid",
  "uname",
  "face",
  "sign",
  "wbi",
  "w_rid",
  "cookie",
  "cookies",
  "session",
  "sessdata",
  "token",
  "authorization",
  "password",
  "headers",
  "rawbody",
  "html",
  "uid",
]);

/**
 * Validates whether a string is a strictly formatted ISO 8601 timestamp with an explicit timezone ('Z' or '[+-]HH:MM').
 *
 * Allowed:
 * - "2026-08-20T12:00:00Z"
 * - "2026-08-20T12:00:00.000Z"
 * - "2026-08-20T12:00:00+08:00"
 * - "2026-08-20T12:00:00.123-05:00"
 *
 * Rejected:
 * - "2026-08-20" (date-only)
 * - "2026-08-20T12:00:00" (missing timezone)
 * - "2026-08-20T12:00:00Z " (whitespace)
 * - "2026-02-30T12:00:00Z" (invalid date)
 */
export function isValidIso8601TimestampWithTimezone(dateStr: string): boolean {
  if (typeof dateStr !== "string" || !dateStr.trim()) {
    return false;
  }
  if (dateStr !== dateStr.trim()) {
    return false;
  }

  // Mandatory date, 'T', time, and explicit timezone indicator ('Z' or '[+-]HH:MM')
  const isoRegex =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/;
  const match = dateStr.match(isoRegex);
  if (!match) {
    return false;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const tzPart = match[8];

  if (year < 1970 || year > 2100 || month < 1 || month > 12) {
    return false;
  }

  // Exact days in month check (handles leap years and month lengths)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    return false;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }

  // Validate timezone offset range if not 'Z'
  if (tzPart !== "Z") {
    const tzMatch = tzPart.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (!tzMatch) {
      return false;
    }
    const tzHour = parseInt(tzMatch[2], 10);
    const tzMin = parseInt(tzMatch[3], 10);
    if (tzHour > 14 || tzMin > 59) {
      return false;
    }
  }

  const timestamp = Date.parse(dateStr);
  if (isNaN(timestamp)) {
    return false;
  }

  return true;
}

/**
 * Validates that an object conforms strictly to the NormalizedBasicProfileInput contract with root key whitelisting.
 */
export function validateBasicProfileInputContract(
  input: unknown
): BasicProfileInputValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["输入必须为非空的有效对象"] };
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);

  // 1. Strict Root Key Whitelist Check & Forbidden Key Check
  for (const key of keys) {
    if (!ALLOWED_BASIC_PROFILE_ROOT_KEYS.has(key)) {
      errors.push(`未知顶层字段 [${key}] 不在 BASIC_PROFILE 契约白名单中`);
    }
    if (FORBIDDEN_RAW_KEYS.has(key.toLowerCase())) {
      errors.push(`禁止包含平台原始字段或敏感凭据属性 [${key}]`);
    }
  }

  // 2. Validate recordId (required, non-empty, non-whitespace string)
  if (typeof record.recordId !== "string" || record.recordId.trim().length === 0) {
    errors.push("recordId 必须为非空且非空白字符串");
  }

  // 3. Validate provenance (declarative label: "LOCAL_FIXTURE" | "REAL_CONNECTOR")
  if (record.provenance !== "LOCAL_FIXTURE" && record.provenance !== "REAL_CONNECTOR") {
    errors.push("provenance 必须为 'LOCAL_FIXTURE' 或 'REAL_CONNECTOR'");
  }

  // 4. Validate availability (required: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE")
  const validAvailabilities = ["AVAILABLE", "PARTIAL", "UNAVAILABLE"];
  if (
    typeof record.availability !== "string" ||
    !validAvailabilities.includes(record.availability)
  ) {
    errors.push("availability 必须为 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE'");
  }

  // 5. Validate displayName (optional: non-empty string or null)
  if (record.displayName !== undefined && record.displayName !== null) {
    if (typeof record.displayName !== "string" || record.displayName.trim().length === 0) {
      errors.push("displayName 若提供则必须为非空白字符串");
    }
  }

  // 6. Validate description (optional: non-empty string or null)
  if (record.description !== undefined && record.description !== null) {
    if (typeof record.description !== "string" || record.description.trim().length === 0) {
      errors.push("description 若提供则必须为非空白字符串");
    }
  }

  // 7. Validate avatarIdentifier (optional: non-empty string or null)
  if (record.avatarIdentifier !== undefined && record.avatarIdentifier !== null) {
    if (typeof record.avatarIdentifier !== "string" || record.avatarIdentifier.trim().length === 0) {
      errors.push("avatarIdentifier 若提供则必须为非空白字符串");
    }
  }

  // 8. Validate observedAt (optional: valid ISO 8601 timestamp with explicit timezone or null)
  if (record.observedAt !== undefined && record.observedAt !== null) {
    if (
      typeof record.observedAt !== "string" ||
      !isValidIso8601TimestampWithTimezone(record.observedAt)
    ) {
      errors.push(
        "observedAt 若提供则必须为带明确时区的 ISO 8601 时间戳 (如 2026-08-20T12:00:00Z 或 +08:00)"
      );
    }
  }

  // 9. Validate tags (optional: string[] or null; no nested objects)
  if (record.tags !== undefined && record.tags !== null) {
    if (!Array.isArray(record.tags)) {
      errors.push("tags 若提供则必须为字符串数组或 null");
    } else {
      for (let i = 0; i < record.tags.length; i++) {
        const tag = record.tags[i];
        if (typeof tag !== "string" || tag.trim().length === 0) {
          errors.push(`tags[${i}] 必须为非空白字符串`);
        }
      }
    }
  }

  // 10. Reject arbitrary nested objects for non-tag fields
  for (const key of keys) {
    if (key !== "tags") {
      const val = record[key];
      if (typeof val === "object" && val !== null) {
        errors.push(`字段 [${key}] 不得为嵌套对象或数组`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a batch of NormalizedBasicProfileInput records, ensuring schema validity and batch-level recordId uniqueness.
 */
export function validateBasicProfileInputBatch(
  inputs: unknown
): BasicProfileInputValidationResult {
  if (!Array.isArray(inputs)) {
    return { valid: false, errors: ["批量输入必须为数组"] };
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i];
    const res = validateBasicProfileInputContract(item);
    if (!res.valid) {
      errors.push(`第 ${i} 项记录校验未通过: ${res.errors.join("; ")}`);
    } else {
      const record = item as NormalizedBasicProfileInput;
      if (seenIds.has(record.recordId)) {
        errors.push(`第 ${i} 项记录存在重复的 recordId [${record.recordId}]`);
      } else {
        seenIds.add(record.recordId);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a validated local fixture basic profile input.
 * Sets provenance to "LOCAL_FIXTURE" upon creation.
 */
export function createLocalFixtureBasicProfileInput(
  params: Omit<NormalizedBasicProfileInput, "provenance">
): NormalizedBasicProfileInput {
  const fixture: NormalizedBasicProfileInput = {
    recordId: params.recordId,
    provenance: "LOCAL_FIXTURE",
    displayName: params.displayName ?? null,
    description: params.description ?? null,
    tags: params.tags ?? null,
    avatarIdentifier: params.avatarIdentifier ?? null,
    observedAt: params.observedAt ?? null,
    availability: params.availability,
  };

  const validation = validateBasicProfileInputContract(fixture);
  if (!validation.valid) {
    throw new Error(`Local fixture validation failed: ${validation.errors.join("; ")}`);
  }

  return fixture;
}

/**
 * Pure adapter converting NormalizedBasicProfileInput into pipeline-compatible PublicSourceRecord.
 * Performs explicit, non-destructive field mapping without `||` falsy fallbacks.
 */
export function basicProfileInputToPublicSourceRecord(
  input: NormalizedBasicProfileInput
): PublicSourceRecord {
  const validation = validateBasicProfileInputContract(input);
  if (!validation.valid) {
    throw new Error(`Basic profile input contract validation failed: ${validation.errors.join("; ")}`);
  }

  return {
    sourceRecordId: input.recordId,
    sourceType: "PROFILE",
    title: input.displayName ?? null,
    description: input.description ?? null,
    tags: input.tags ?? null,
    authorName: input.displayName ?? null,
    observedAt: input.observedAt ?? null,
    availability: input.availability,
    sourceUrl: null, // No raw platform URLs stored in deterministic record
  };
}
