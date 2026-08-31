/**
 * BiliProfile Analyzer — Anonymous Session Management
 *
 * Implements lightweight, privacy-preserving, and HttpOnly anonymous device/browser
 * session tracking for task ownership and data isolation without a full account system.
 *
 * Security & Invariants:
 * - Cookie: `bili_anonymous_session`
 * - Attributes: HttpOnly, SameSite=Lax, Path=/, Max-Age=30 days, Secure (in production).
 * - Zero PII stored in cookie: only a random cryptographically secure UUID.
 * - Supports `x-session-id` header for automated headless integration tests.
 */

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";

export const ANONYMOUS_SESSION_COOKIE = "bili_anonymous_session";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

/**
 * Validates whether a given string is a valid session ID (UUID v4 format or safe alphanumeric).
 */
export function isValidSessionId(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length < 8 || trimmed.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Reads existing anonymous session ID from request cookie or test header.
 * Returns null if no valid session is found.
 */
export function getAnonymousSessionId(request?: NextRequest | null): string | null {
  if (!request) return null;

  // 1. Check custom test header first
  const headerVal = request.headers?.get("x-session-id");
  if (headerVal && isValidSessionId(headerVal)) {
    return headerVal.trim();
  }

  // 2. Check HttpOnly cookie
  const cookieVal = request.cookies?.get(ANONYMOUS_SESSION_COOKIE)?.value;
  if (cookieVal && isValidSessionId(cookieVal)) {
    return cookieVal.trim();
  }

  return null;
}

/**
 * Gets existing session ID or creates a new cryptographically random session ID.
 */
export function getOrCreateAnonymousSessionId(request?: NextRequest | null): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = request ? getAnonymousSessionId(request) : null;
  if (existing) {
    return { sessionId: existing, isNew: false };
  }

  const newSessionId = crypto.randomUUID();
  return { sessionId: newSessionId, isNew: true };
}

/**
 * Sets the HttpOnly session cookie on the given response.
 */
export function applySessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(ANONYMOUS_SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
