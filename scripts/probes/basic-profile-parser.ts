/**
 * BiliProfile Analyzer — Basic Profile Minimal Field Signal & Value Parser (Phase 4.4b / 4.6)
 *
 * Safety & Invariant Rules:
 * 1. Pure offline in-memory analysis of synthetic HTML chunks/streams.
 * 2. Zero network calls, zero external API dependencies.
 * 3. Does not assume or hardcode real live Bilibili layout; tests use synthetic fixtures.
 * 4. Hard ceilings:
 *    - MAX_BYTES_CAP = 64 * 1024 (65536 bytes)
 *    - MAX_WINDOW_CHARS = 2048 characters
 *    - Parameter clamping can ONLY tighten, never loosen bounds.
 * 5. Data minimization: NEVER returns, prints, or persists actual field values or text contents.
 *    Only outputs metadata flags:
 *    - Signal status: UNVERIFIED / OBSERVED / NOT_OBSERVED / NOT_ATTEMPTED
 *    - Value validation status: PARSED_NONEMPTY / PARSED_EMPTY_OR_ABSENT / PARSE_REJECTED / NOT_OBSERVED
 * 6. "OBSERVED" indicates only that a parseable signal was detected in testing;
 *    it does NOT indicate real production availability, full extraction, or report readiness.
 */

import {
  IndividualFieldSignalStatus,
  BasicProfileFieldSignals,
  FieldValueValidationStatus,
  BasicProfileValueValidationResult,
  BasicProfileSignalInspectionResult,
} from "../../src/types/connector";
import {
  MAX_BYTES_CAP,
  MAX_WINDOW_CHARS,
  clampSecurityCeiling,
} from "./bilibili-public-capability";

export const PARSER_RULE_VERSION = "0.2.0-phase4.6-minimal-validation";

// Synthetic signal matching patterns (strictly metadata checks, no text extraction)
const DISPLAY_NAME_SIGNAL_PATTERNS = [
  /<h[1-6][^>]*class=["'][^"']*h-name[^"']*["'][^>]*>[\s\S]*?<\/h[1-6]>/i,
  /<meta[^>]+property=["']og:title["'][^>]*>/i,
  /<meta[^>]+content=["'][^"']*["'][^>]+property=["']og:title["'][^>]*>/i,
  /<title[^>]*>[\s\S]*?<\/title>/i,
  /<span[^>]*id=["']h-name["'][^>]*>[\s\S]*?<\/span>/i,
];

const AVATAR_URL_SIGNAL_PATTERNS = [
  /<img[^>]*class=["'][^"']*h-avatar[^"']*["'][^>]*>/i,
  /<meta[^>]+property=["']og:image["'][^>]*>/i,
  /<meta[^>]+content=["'][^"']*["'][^>]+property=["']og:image["'][^>]*>/i,
  /<img[^>]*id=["']h-avatar["'][^>]*>/i,
];

const SIGNATURE_SIGNAL_PATTERNS = [
  /<h[1-6][^>]*class=["'][^"']*h-sign[^"']*["'][^>]*>[\s\S]*?<\/h[1-6]>/i,
  /<meta[^>]+name=["']description["'][^>]*>/i,
  /<meta[^>]+content=["'][^"']*["'][^>]+name=["']description["'][^>]*>/i,
  /<meta[^>]+property=["']og:description["'][^>]*>/i,
  /<span[^>]*id=["']h-sign["'][^>]*>[\s\S]*?<\/span>/i,
  /<div[^>]*class=["'][^"']*h-sign[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
];

// Value extraction capture patterns (used strictly in memory for presence/syntax checks)
const DISPLAY_NAME_EXTRACT_PATTERNS = [
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
  /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
  /<h[1-6][^>]*class=["'][^"']*h-name[^"']*["'][^>]*>([^<]*)<\/h[1-6]>/i,
  /<span[^>]*id=["']h-name["'][^>]*>([^<]*)<\/span>/i,
  /<title[^>]*>([^<]*)<\/title>/i,
];

const AVATAR_URL_EXTRACT_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
  /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
  /<img[^>]*class=["'][^"']*h-avatar[^"']*["'][^>]*src=["']([^"']*)["']/i,
  /<img[^>]*src=["']([^"']*)["'][^>]*class=["'][^"']*h-avatar[^"']*["']/i,
  /<img[^>]*id=["']h-avatar["'][^>]*src=["']([^"']*)["']/i,
];

const SIGNATURE_EXTRACT_PATTERNS = [
  /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  /<h[1-6][^>]*class=["'][^"']*h-sign[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i,
  /<span[^>]*id=["']h-sign["'][^>]*>([\s\S]*?)<\/span>/i,
  /<div[^>]*class=["'][^"']*h-sign[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
];

function testAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function extractFirstCandidate(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && typeof match[1] === "string") {
      return match[1];
    }
  }
  return null;
}

/**
 * Pure memory validation for displayName candidate.
 * Returns only validation status enum, NEVER the name string.
 */
export function validateParsedDisplayName(
  candidate: string | null | undefined
): FieldValueValidationStatus {
  if (candidate === null || candidate === undefined) {
    return "NOT_OBSERVED";
  }
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return "PARSED_EMPTY_OR_ABSENT";
  }
  // Reject if contains dangerous unprintable control characters
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) {
    return "PARSE_REJECTED";
  }
  return "PARSED_NONEMPTY";
}

/**
 * Pure memory validation for avatarUrl candidate.
 * Checks http/https URL syntax validity.
 * Returns only status and boolean, NEVER the URL string.
 */
export function validateParsedAvatarUrl(
  candidate: string | null | undefined
): { status: FieldValueValidationStatus; isValidHttpUrl: boolean } {
  if (candidate === null || candidate === undefined) {
    return { status: "NOT_OBSERVED", isValidHttpUrl: false };
  }
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return { status: "PARSED_EMPTY_OR_ABSENT", isValidHttpUrl: false };
  }

  // Normalize protocol-relative URL (e.g., //i0.hdslb.com/...)
  let normalized = trimmed;
  if (normalized.startsWith("//")) {
    normalized = "https:" + normalized;
  }

  try {
    const parsedUrl = new URL(normalized);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      if (parsedUrl.hostname && !/[\u0000-\u001F\s]/.test(parsedUrl.hostname)) {
        return { status: "PARSED_NONEMPTY", isValidHttpUrl: true };
      }
    }
    return { status: "PARSE_REJECTED", isValidHttpUrl: false };
  } catch {
    return { status: "PARSE_REJECTED", isValidHttpUrl: false };
  }
}

/**
 * Pure memory validation for signature candidate.
 * Returns only validation status enum, NEVER the signature string.
 */
export function validateParsedSignature(
  candidate: string | null | undefined
): FieldValueValidationStatus {
  if (candidate === null || candidate === undefined) {
    return "NOT_OBSERVED";
  }
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return "PARSED_EMPTY_OR_ABSENT";
  }
  // Reject if contains corrupted or malicious control characters
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) {
    return "PARSE_REJECTED";
  }
  return "PARSED_NONEMPTY";
}

/**
 * Pure in-memory chunk inspector for synthetic basic profile signals.
 * Evaluates whether signals exist within the specified sliding window.
 * Returns only boolean status flags, NEVER returns actual text.
 */
export function inspectBasicProfileSignalsFromHtmlChunk(
  chunkString: string,
  maxWindowChars: number = MAX_WINDOW_CHARS
): BasicProfileFieldSignals {
  if (!chunkString || typeof chunkString !== "string") {
    return {
      displayName: "NOT_OBSERVED",
      avatarUrl: "NOT_OBSERVED",
      signature: "NOT_OBSERVED",
    };
  }

  const safeMaxWindowChars = clampSecurityCeiling(maxWindowChars, MAX_WINDOW_CHARS);
  const boundedText =
    chunkString.length > safeMaxWindowChars
      ? chunkString.slice(-safeMaxWindowChars)
      : chunkString;

  const hasDisplayName = testAnyPattern(boundedText, DISPLAY_NAME_SIGNAL_PATTERNS);
  const hasAvatarUrl = testAnyPattern(boundedText, AVATAR_URL_SIGNAL_PATTERNS);
  const hasSignature = testAnyPattern(boundedText, SIGNATURE_SIGNAL_PATTERNS);

  return {
    displayName: hasDisplayName ? "OBSERVED" : "NOT_OBSERVED",
    avatarUrl: hasAvatarUrl ? "OBSERVED" : "NOT_OBSERVED",
    signature: hasSignature ? "OBSERVED" : "NOT_OBSERVED",
  };
}

/**
 * Minimal streaming inspector for synthetic basic profile field signals and values.
 * - Respects safeMaxBytesCap clamped to MAX_BYTES_CAP (64 KiB).
 * - Maintains fixed-size sliding window clamped to MAX_WINDOW_CHARS (2048).
 * - Buffer length is strictly <= safeMaxWindowChars at all times.
 * - Slices incoming chunks before decoding.
 * - Validates field non-emptiness & URL syntax in memory without outputting values.
 * - Immediately cancels reader when all candidate signals/values are resolved or cap reached.
 * - Never returns, outputs, or persists the actual text inside the fields.
 */
export async function inspectBasicProfileSignalsFromStream(
  body: ReadableStream<Uint8Array>,
  maxBytesCap: number = MAX_BYTES_CAP,
  maxWindowChars: number = MAX_WINDOW_CHARS,
  verifyValues: boolean = true
): Promise<BasicProfileSignalInspectionResult> {
  const safeMaxBytesCap = clampSecurityCeiling(maxBytesCap, MAX_BYTES_CAP);
  const safeMaxWindowChars = clampSecurityCeiling(maxWindowChars, MAX_WINDOW_CHARS);

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let bytesProcessed = 0;
  let rollingBuffer = "";
  let maxObservedBufferLength = 0;

  let displayNameObserved: IndividualFieldSignalStatus = "NOT_OBSERVED";
  let avatarUrlObserved: IndividualFieldSignalStatus = "NOT_OBSERVED";
  let signatureObserved: IndividualFieldSignalStatus = "NOT_OBSERVED";

  let displayNameValStatus: FieldValueValidationStatus = "NOT_OBSERVED";
  let avatarUrlValStatus: FieldValueValidationStatus = "NOT_OBSERVED";
  let avatarUrlSyntaxValid = false;
  let signatureValStatus: FieldValueValidationStatus = "NOT_OBSERVED";

  try {
    while (bytesProcessed < safeMaxBytesCap) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remainingBytes = safeMaxBytesCap - bytesProcessed;
      if (remainingBytes <= 0) break;

      const bytesToProcess = Math.min(value.byteLength, remainingBytes);
      const chunkSlice =
        value.byteLength === bytesToProcess
          ? value
          : value.subarray(0, bytesToProcess);

      const stepSize = Math.max(1, Math.min(256, safeMaxWindowChars));
      for (let offset = 0; offset < chunkSlice.byteLength; offset += stepSize) {
        const subSlice = chunkSlice.subarray(
          offset,
          Math.min(offset + stepSize, chunkSlice.byteLength)
        );
        bytesProcessed += subSlice.byteLength;

        const decodedSub = decoder.decode(subSlice, { stream: true });

        // Maintain sliding window buffer: NEVER allow rollingBuffer to exceed safeMaxWindowChars
        if (decodedSub.length >= safeMaxWindowChars) {
          rollingBuffer = decodedSub.slice(-safeMaxWindowChars);
        } else {
          const maxOldLength = safeMaxWindowChars - decodedSub.length;
          if (rollingBuffer.length > maxOldLength) {
            rollingBuffer = rollingBuffer.slice(-maxOldLength);
          }
          rollingBuffer += decodedSub;
        }

        if (rollingBuffer.length > maxObservedBufferLength) {
          maxObservedBufferLength = rollingBuffer.length;
        }

        // Check for field signals incrementally
        if (displayNameObserved !== "OBSERVED" && testAnyPattern(rollingBuffer, DISPLAY_NAME_SIGNAL_PATTERNS)) {
          displayNameObserved = "OBSERVED";
        }
        if (avatarUrlObserved !== "OBSERVED" && testAnyPattern(rollingBuffer, AVATAR_URL_SIGNAL_PATTERNS)) {
          avatarUrlObserved = "OBSERVED";
        }
        if (signatureObserved !== "OBSERVED" && testAnyPattern(rollingBuffer, SIGNATURE_SIGNAL_PATTERNS)) {
          signatureObserved = "OBSERVED";
        }

        // Check value validation in memory if enabled
        if (verifyValues) {
          if (displayNameValStatus !== "PARSED_NONEMPTY") {
            const nameCand = extractFirstCandidate(rollingBuffer, DISPLAY_NAME_EXTRACT_PATTERNS);
            if (nameCand !== null) {
              displayNameValStatus = validateParsedDisplayName(nameCand);
            }
          }

          if (avatarUrlValStatus !== "PARSED_NONEMPTY") {
            const avatarCand = extractFirstCandidate(rollingBuffer, AVATAR_URL_EXTRACT_PATTERNS);
            if (avatarCand !== null) {
              const res = validateParsedAvatarUrl(avatarCand);
              avatarUrlValStatus = res.status;
              avatarUrlSyntaxValid = res.isValidHttpUrl;
            }
          }

          if (signatureValStatus !== "PARSED_NONEMPTY") {
            const signCand = extractFirstCandidate(rollingBuffer, SIGNATURE_EXTRACT_PATTERNS);
            if (signCand !== null) {
              signatureValStatus = validateParsedSignature(signCand);
            }
          }
        }

        // Early cutoff if all 3 signals are observed and value statuses resolved
        const signalsAllObserved =
          displayNameObserved === "OBSERVED" &&
          avatarUrlObserved === "OBSERVED" &&
          signatureObserved === "OBSERVED";

        const valuesAllResolved =
          !verifyValues ||
          (displayNameValStatus === "PARSED_NONEMPTY" &&
            avatarUrlValStatus === "PARSED_NONEMPTY" &&
            signatureValStatus === "PARSED_NONEMPTY");

        if (signalsAllObserved && valuesAllResolved) {
          break;
        }
      }

      const signalsAllObserved =
        displayNameObserved === "OBSERVED" &&
        avatarUrlObserved === "OBSERVED" &&
        signatureObserved === "OBSERVED";

      const valuesAllResolved =
        !verifyValues ||
        (displayNameValStatus === "PARSED_NONEMPTY" &&
          avatarUrlValStatus === "PARSED_NONEMPTY" &&
          signatureValStatus === "PARSED_NONEMPTY");

      if (signalsAllObserved && valuesAllResolved) {
        break;
      }

      if (value.byteLength > remainingBytes) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel("Streaming basic profile inspection finished.");
    } catch {
      // Reader may already be closed
    }
  }

  return {
    ruleVersion: PARSER_RULE_VERSION,
    signals: {
      displayName: displayNameObserved,
      avatarUrl: avatarUrlObserved,
      signature: signatureObserved,
    },
    valueValidation: verifyValues
      ? {
          displayName: displayNameValStatus,
          avatarUrl: avatarUrlValStatus,
          avatarUrlSyntaxValid,
          signature: signatureValStatus,
        }
      : undefined,
    bytesProcessed,
    maxObservedBufferLength,
  };
}
