/**
 * BiliProfile Analyzer — Controlled Test-Data Cleanup Auth
 *
 * Server-only gate for two privileged operations:
 *  - Marking a created task/target as test data (POST /api/tasks with valid token)
 *  - Deleting test data (DELETE /api/admin/test-cleanup/[taskId])
 *
 * Security invariants:
 *  - The token is read ONLY from `process.env.TEST_CLEANUP_TOKEN` (a server-side secret).
 *  - It is NEVER returned in any response, logged, or exposed to the client.
 *  - It is compared in constant time to avoid timing side-channels.
 *  - If the token is not configured server-side, NO request can ever pass (fail-closed).
 *  - Preview and Production MUST use DIFFERENT token values (set per Vercel environment),
 *    so a Preview token can never touch Production data and vice versa.
 */

import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

export const TEST_CLEANUP_TOKEN_HEADER = "x-test-cleanup-token";

/**
 * Returns true only when the request carries the exact server-side TEST_CLEANUP_TOKEN.
 * Fail-closed: missing token, misconfigured env, or mismatch all return false.
 */
export function isTestCleanupTokenValid(request: NextRequest): boolean {
  const expected = process.env.TEST_CLEANUP_TOKEN;
  if (!expected || expected.length === 0) {
    return false;
  }

  const provided = request.headers.get(TEST_CLEANUP_TOKEN_HEADER);
  if (!provided) {
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
