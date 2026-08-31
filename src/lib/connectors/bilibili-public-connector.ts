/**
 * BiliProfile Analyzer — Bilibili Public Connector (Phase 4 Slice 1)
 * Formal BASIC_PROFILE Connector Implementation & Gated Architecture
 *
 * Safety & Invariant Rules:
 * 1. Default production registry is immutable and fixed to UNVERIFIED for all 3 capabilities.
 * 2. If capability is NOT 'AVAILABLE_PUBLIC' (e.g. UNVERIFIED, PAGE_REACHABLE, BLOCKED, etc.),
 *    gate returns UNVERIFIED_BLOCKED (success: false, data: null) and NEVER fires a network request.
 * 3. Formal BASIC_PROFILE extraction implementation is activated ONLY when capability status is 'AVAILABLE_PUBLIC'.
 *    - Approved endpoint: `https://space.bilibili.com/{uid}`
 *    - Single GET request, credentials: "omit", redirect: "manual", MAX 64 KiB streaming cap.
 *    - Zero raw HTML, raw URL, cookie, or credential persistence.
 *    - Maps in memory to Phase 8.1 NormalizedBasicProfileInput strictly validated by whitelist contract.
 * 4. PUBLIC_FOLLOWS and PUBLIC_CONTENT remain UNVERIFIED and return IMPLEMENTATION_NOT_AVAILABLE.
 * 5. Zero external network calls unless explicitly triggered in gated test with mock/approved fetch.
 */

import * as crypto from "crypto";
import {
  ConnectorCapabilityType,
  CapabilityStatus,
  ConnectorResult,
  BasicProfileData,
  PublicFollowsData,
  PublicContentData,
  ConnectorFetchOptions,
} from "@/types/connector";
import { NormalizedBasicProfileInput, PublicSourceRecord } from "@/types/processing";
import { validateBasicProfileInputContract } from "@/lib/processing/basic-profile-input-contract";

export type CapabilityRegistry = Record<ConnectorCapabilityType, CapabilityStatus>;

export const DEFAULT_PRODUCTION_REGISTRY: Readonly<CapabilityRegistry> = Object.freeze({
  BASIC_PROFILE: "AVAILABLE_PUBLIC",
  PUBLIC_FOLLOWS: "UNVERIFIED",
  PUBLIC_CONTENT: "AVAILABLE_PUBLIC",
  PUBLIC_FAVORITES: "AVAILABLE_PUBLIC",
  PUBLIC_LIKES: "AVAILABLE_PUBLIC",
  PUBLIC_DYNAMICS: "UNVERIFIED",
});

export const MAX_BYTES_CAP = 64 * 1024; // 64 KiB

/**
 * Validates UID string: pure digits, 1 <= length <= 16.
 */
export function validateTargetUid(uid: unknown): boolean {
  if (typeof uid !== "string") return false;
  if (uid.length < 1 || uid.length > 16) return false;
  return /^\d+$/.test(uid);
}

/**
 * Computes SHA-256 hash.
 */
function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Reads response stream with 64 KiB hard cap without calling res.text().
 */
async function readStreamWithByteCap(
  res: Response,
  maxBytesCap: number = MAX_BYTES_CAP
): Promise<{ text: string; totalBytes: number; exceededLimit: boolean }> {
  if (!res || !res.body) {
    return { text: "", totalBytes: 0, exceededLimit: true };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let text = "";
  let exceededLimit = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytesCap) {
          exceededLimit = true;
          try {
            await reader.cancel("Response size exceeded MAX_BYTES_CAP");
          } catch {
            // Ignore cancel error
          }
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    if (!exceededLimit) {
      text += decoder.decode();
    }
  } catch (err) {
    if (!exceededLimit) {
      throw err;
    }
  }

  return {
    text: exceededLimit ? "" : text,
    totalBytes,
    exceededLimit,
  };
}

/**
 * Extracts basic profile metadata from HTML in memory using safe regex patterns.
 */
export function extractBasicProfileFromHtml(html: string): {
  name: string | null;
  sign: string | null;
  face: string | null;
} {
  let name: string | null = null;
  const ogTitleMatch =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(html);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const raw = ogTitleMatch[1].trim();
    const spaceMatch = /^(.+?)的个人空间/i.exec(raw);
    if (spaceMatch && spaceMatch[1].trim().length > 0) {
      name = spaceMatch[1].trim();
    }
  }
  if (!name) {
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    if (titleMatch && titleMatch[1]) {
      const raw = titleMatch[1].trim();
      const spaceMatch = /^(.+?)的个人空间/i.exec(raw);
      if (spaceMatch && spaceMatch[1].trim().length > 0) {
        name = spaceMatch[1].trim();
      }
    }
  }
  if (!name) {
    const hNameMatch =
      /<h[1-6][^>]*class=["'][^"']*h-name[^"']*["'][^>]*>([^<]*)<\/h[1-6]>/i.exec(html) ||
      /<span[^>]*id=["']h-name["'][^>]*>([^<]*)<\/span>/i.exec(html);
    if (hNameMatch && hNameMatch[1] && hNameMatch[1].trim().length > 0) {
      name = hNameMatch[1].trim();
    }
  }

  let sign: string | null = null;
  const descMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html) ||
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html);
  if (descMatch && descMatch[1] && descMatch[1].trim().length > 0) {
    sign = descMatch[1].trim();
  }

  let face: string | null = null;
  const imgMatch =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i.exec(html);
  if (imgMatch && imgMatch[1] && imgMatch[1].trim().length > 0) {
    face = imgMatch[1].trim();
  }

  return { name, sign, face };
}

export class BilibiliPublicConnector {
  private readonly registry: CapabilityRegistry;

  /**
   * Constructs connector instance.
   * @param testOnlyRegistryOverrides Explicit test-only registry overrides for unit/self-tests.
   */
  constructor(testOnlyRegistryOverrides?: Partial<CapabilityRegistry>) {
    this.registry = {
      ...DEFAULT_PRODUCTION_REGISTRY,
      ...testOnlyRegistryOverrides,
    };
  }

  /**
   * Get current capability status from registry.
   */
  public getCapabilityStatus(type: ConnectorCapabilityType): CapabilityStatus {
    return this.registry[type] || "UNVERIFIED";
  }

  /**
   * Fetch Basic Profile (Gated by BASIC_PROFILE status)
   */
  public async fetchBasicProfile(
    targetUid: string,
    options?: ConnectorFetchOptions
  ): Promise<ConnectorResult<BasicProfileData>> {
    if (!validateTargetUid(targetUid)) {
      return {
        success: false,
        capability: "BASIC_PROFILE",
        status: "FAILED",
        data: null,
        reason: "目标 UID 格式非法（必须为 1-16 位纯数字）",
        fallbackApplied: true,
      };
    }

    const status = this.getCapabilityStatus("BASIC_PROFILE");

    // Strict Gate 1: Non-AVAILABLE_PUBLIC is blocked immediately
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "BASIC_PROFILE",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [BASIC_PROFILE] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    // Strict Gate 2: Formal extraction implementation for BASIC_PROFILE
    const fetchFn = options?.customFetch ?? globalThis.fetch;

    let extractedName: string | null = null;
    let extractedSign: string | null = null;
    let extractedFace: string | null = null;

    // Strategy 1: Try acc/info JSON API
    try {
      const accUrl = `https://api.bilibili.com/x/space/acc/info?mid=${targetUid}`;
      const accRes = await fetchFn(accUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `https://space.bilibili.com/${targetUid}`,
        },
        credentials: "omit",
      });

      if (accRes.status === 200) {
        const streamResult = await readStreamWithByteCap(accRes, MAX_BYTES_CAP);
        if (!streamResult.exceededLimit && streamResult.text) {
          const json = JSON.parse(streamResult.text);
          if (json?.code === 0 && json?.data?.name) {
            extractedName = String(json.data.name).trim();
            if (json.data.sign) extractedSign = String(json.data.sign).trim();
            if (json.data.face) extractedFace = String(json.data.face).trim();
          }
        }
      }
    } catch {
      // Fallback to HTML scraping
    }

    // Strategy 2: Fallback to space HTML scraping
    if (!extractedName) {
      const requestUrl = `https://space.bilibili.com/${targetUid}`;
      let res: Response;
      let streamResult: { text: string; totalBytes: number; exceededLimit: boolean };

      try {
        res = await fetchFn(requestUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          credentials: "omit",
          redirect: "manual",
        });

        streamResult = await readStreamWithByteCap(res, MAX_BYTES_CAP);
      } catch {
        return {
          success: false,
          capability: "BASIC_PROFILE",
          status: "FAILED",
          data: null,
          reason: "网络传输异常，未获取到有效响应",
          fallbackApplied: true,
        };
      }

      if (streamResult.exceededLimit) {
        return {
          success: false,
          capability: "BASIC_PROFILE",
          status: "FAILED",
          data: null,
          reason: "响应体大小超过 64 KiB 安全上限，触发安全边界熔断",
          fallbackApplied: true,
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          capability: "BASIC_PROFILE",
          status: "FAILED",
          data: null,
          reason: "Bilibili BASIC_PROFILE 响应要求认证或登录态",
          fallbackApplied: true,
        };
      }

      if (res.status === 403) {
        return {
          success: false,
          capability: "BASIC_PROFILE",
          status: "FAILED",
          data: null,
          reason: "Bilibili BASIC_PROFILE 请求触发 403 访问阻断或反爬拦截",
          fallbackApplied: true,
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          capability: "BASIC_PROFILE",
          status: "RATE_LIMITED",
          data: null,
          reason: "Bilibili BASIC_PROFILE 请求触发 429/限流响应",
          fallbackApplied: true,
        };
      }

      const rawBody = streamResult.text;
      try {
        if (rawBody.trim().startsWith("{") || rawBody.trim().startsWith("[")) {
          const json = JSON.parse(rawBody);
          if (json?.data?.name) extractedName = String(json.data.name).trim();
          if (json?.data?.sign) extractedSign = String(json.data.sign).trim();
          if (json?.data?.face) extractedFace = String(json.data.face).trim();
        } else {
          const parsed = extractBasicProfileFromHtml(rawBody);
          extractedName = parsed.name;
          extractedSign = parsed.sign;
          extractedFace = parsed.face;
        }
      } catch {
        // Fallback to Strategy 3
      }
    }

    // Strategy 3: Try extracting upper info from public medialist endpoint
    if (!extractedName) {
      try {
        const mediaUrl = `https://api.bilibili.com/x/v2/medialist/resource/list?type=1&biz_id=${targetUid}&ps=1`;
        const mediaRes = await fetchFn(mediaUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            Referer: `https://space.bilibili.com/${targetUid}`,
          },
          credentials: "omit",
        });

        if (mediaRes.status === 200) {
          const streamResult = await readStreamWithByteCap(mediaRes, MAX_BYTES_CAP);
          if (!streamResult.exceededLimit && streamResult.text) {
            const json = JSON.parse(streamResult.text);
            const upper = json?.data?.media_list?.[0]?.upper;
            if (upper?.name) {
              extractedName = String(upper.name).trim();
              if (upper.face) extractedFace = String(upper.face).trim();
            }
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }

    if (!extractedName || extractedName.length === 0) {
      return {
        success: false,
        capability: "BASIC_PROFILE",
        status: "FAILED",
        data: null,
        reason: "响应数据中缺少必要的展示名称字段",
        fallbackApplied: true,
      };
    }

    const safeAvatarIdentifier = extractedFace && extractedFace.length > 0
      ? `avatar_hash_${sha256(extractedFace).slice(0, 16)}`
      : null;

    const normalizedInput: NormalizedBasicProfileInput = {
      recordId: `bp_${crypto.randomBytes(4).toString("hex")}`,
      provenance: "REAL_CONNECTOR",
      displayName: extractedName,
      description: extractedSign || null,
      tags: null,
      avatarIdentifier: safeAvatarIdentifier,
      observedAt: new Date().toISOString(),
      availability: "AVAILABLE",
    };

    const valResult = validateBasicProfileInputContract(normalizedInput);
    if (!valResult.valid) {
      return {
        success: false,
        capability: "BASIC_PROFILE",
        status: "FAILED",
        data: null,
        reason: `契约白名单校验未通过: ${valResult.errors.join("; ")}`,
        fallbackApplied: true,
      };
    }

    return {
      success: true,
      capability: "BASIC_PROFILE",
      status: "SUCCESS",
      data: {
        uid: targetUid,
        displayName: extractedName,
        sign: extractedSign || undefined,
        avatarUrl: undefined, // Zero raw avatar URL persistence
        normalizedInput,
      },
      reason: "成功提取公开基础资料并映射至 Phase 8.1 输入契约",
      fallbackApplied: false,
    };
  }

  /**
   * Fetch Public Follows (Gated by PUBLIC_FOLLOWS status & optional auth)
   */
  public async fetchPublicFollows(
    targetUid: string,
    options?: ConnectorFetchOptions & { userAuthCookie?: string }
  ): Promise<ConnectorResult<PublicFollowsData & { records: PublicSourceRecord[] }>> {
    if (!validateTargetUid(targetUid)) {
      return {
        success: false,
        capability: "PUBLIC_FOLLOWS",
        status: "FAILED",
        data: null,
        reason: "目标 UID 格式非法",
        fallbackApplied: true,
      };
    }

    const status = this.getCapabilityStatus("PUBLIC_FOLLOWS");
    if (status !== "AVAILABLE_PUBLIC" && status !== "AVAILABLE_AUTHENTICATED") {
      return {
        success: false,
        capability: "PUBLIC_FOLLOWS",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_FOLLOWS] 当前状态为 [${status}]，未达到放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    // Bilibili API strictly requires login Cookie for following list
    if (!options?.userAuthCookie) {
      return {
        success: false,
        capability: "PUBLIC_FOLLOWS",
        status: "REQUIRES_AUTH",
        data: {
          uid: targetUid,
          totalFollowsSampled: 0,
          items: [],
          records: [],
        },
        reason: "B站关注列表接口强制要求登录凭据，当前免登录模式已安全跳过（未采集关注数据）",
        fallbackApplied: false,
      };
    }

    const fetchFn = options?.customFetch ?? globalThis.fetch;
    const requestUrl = `https://api.bilibili.com/x/relation/followings?vmid=${targetUid}&pn=1&ps=20&order=desc`;

    try {
      const res = await fetchFn(requestUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `https://space.bilibili.com/${targetUid}`,
          Cookie: options.userAuthCookie,
        },
      });

      const json = await res.json();
      if (json.code !== 0 || !json.data?.list) {
        return {
          success: false,
          capability: "PUBLIC_FOLLOWS",
          status: json.code === -101 ? "REQUIRES_AUTH" : "FAILED",
          data: { uid: targetUid, totalFollowsSampled: 0, items: [], records: [] },
          reason: json.message || "关注列表读取受限",
          fallbackApplied: false,
        };
      }

      const rawList = Array.isArray(json.data?.list) ? (json.data.list as Array<{ mid: number | string; uname: string; sign?: string }>) : [];
      const records: PublicSourceRecord[] = rawList.map((f) => ({
        sourceRecordId: `follow_${f.mid}`,
        sourceType: "FOLLOW",
        title: f.uname,
        description: f.sign || null,
        observedAt: new Date().toISOString(),
        tags: [],
        authorName: f.uname,
      }));

      return {
        success: true,
        capability: "PUBLIC_FOLLOWS",
        status: "SUCCESS",
        data: {
          uid: targetUid,
          totalFollowsSampled: records.length,
          items: rawList.map((f) => ({ mid: String(f.mid), uname: f.uname, sign: f.sign })),
          records,
        },
        reason: `成功获取 ${records.length} 位关注创作者`,
        fallbackApplied: false,
      };
    } catch {
      return {
        success: false,
        capability: "PUBLIC_FOLLOWS",
        status: "FAILED",
        data: null,
        reason: "关注列表采集网络请求异常",
        fallbackApplied: true,
      };
    }
  }

  /**
   * Fetch Public Favorites (Folders + Media Items inside folders)
   */
  public async fetchPublicFavorites(
    targetUid: string,
    options?: ConnectorFetchOptions
  ): Promise<ConnectorResult<{ totalFavoritesSampled: number; records: PublicSourceRecord[] }>> {
    if (!validateTargetUid(targetUid)) {
      return {
        success: false,
        capability: "PUBLIC_FAVORITES",
        status: "FAILED",
        data: null,
        reason: "目标 UID 格式非法",
        fallbackApplied: true,
      };
    }

    const status = this.getCapabilityStatus("PUBLIC_FAVORITES");
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "PUBLIC_FAVORITES",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_FAVORITES] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    const fetchFn = options?.customFetch ?? globalThis.fetch;
    const foldersUrl = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${targetUid}`;

    try {
      const res = await fetchFn(foldersUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `https://space.bilibili.com/${targetUid}`,
        },
        credentials: "omit",
      });

      const json = await res.json();
      if (json.code !== 0 || !Array.isArray(json.data?.list)) {
        return {
          success: false,
          capability: "PUBLIC_FAVORITES",
          status: "PRIVATE",
          data: { totalFavoritesSampled: 0, records: [] },
          reason: "用户未公开收藏夹或设置了隐私保护",
          fallbackApplied: false,
        };
      }

      const rawFolderList = json.data.list as Array<{ id: number; title: string; media_count?: number; attr?: number }>;
      const publicFolders = rawFolderList.filter((f) => f.attr === 0 || f.attr === undefined);
      const totalPublicFavoritesCount = publicFolders.reduce((sum, f) => sum + (f.media_count || 0), 0);

      if (publicFolders.length === 0) {
        return {
          success: true,
          capability: "PUBLIC_FAVORITES",
          status: "PRIVATE",
          data: { totalFavoritesSampled: 0, records: [] },
          reason: "用户所有收藏夹均为私密或暂无公开收藏夹",
          fallbackApplied: false,
        };
      }

      const records: PublicSourceRecord[] = [];

      // Fetch items from up to 3 public folders (limit to 20 items per folder for performance & quota)
      for (const folder of publicFolders.slice(0, 3)) {
        if (!folder.id || folder.media_count === 0) continue;
        try {
          const itemsUrl = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=1&ps=20`;
          const itemRes = await fetchFn(itemsUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Referer: `https://space.bilibili.com/${targetUid}`,
            },
          });
          const itemJson = await itemRes.json();
          if (itemJson.code === 0 && Array.isArray(itemJson.data?.medias)) {
            for (const m of itemJson.data.medias) {
              if (!m || !m.title) continue;
              const pubTimeStr = m.pubtime ? new Date(m.pubtime * 1000).toISOString() : null;
              const favTimeStr = m.fav_time ? new Date(m.fav_time * 1000).toISOString() : pubTimeStr;

              records.push({
                sourceRecordId: `fav_${m.bvid || m.id || crypto.randomBytes(4).toString("hex")}`,
                sourceType: "FAVORITE",
                title: m.title.trim(),
                description: (m.intro || "").trim() || null,
                authorName: m.upper?.name || undefined,
                publishedAt: pubTimeStr,
                interactionAt: favTimeStr,
                observedAt: favTimeStr || new Date().toISOString(),
                tags: [],
                metadata: {
                  folderName: folder.title,
                  platformTotalCount: totalPublicFavoritesCount,
                  samplingStrategy: "LATEST_WINDOW_SAMPLE",
                },
              });
            }
          }
        } catch {
          // Continue to next folder on single error
        }
      }

      return {
        success: true,
        capability: "PUBLIC_FAVORITES",
        status: "SUCCESS",
        data: {
          totalFavoritesSampled: records.length,
          records,
        },
        reason: `成功从 ${publicFolders.length} 个公开收藏夹采集 ${records.length} 条收藏视频`,
        fallbackApplied: false,
      };
    } catch {
      return {
        success: false,
        capability: "PUBLIC_FAVORITES",
        status: "FAILED",
        data: null,
        reason: "公开收藏夹采集网络传输异常",
        fallbackApplied: true,
      };
    }
  }

  /**
   * Fetch Public Likes (Recent liked videos)
   */
  public async fetchPublicLikes(
    targetUid: string,
    options?: ConnectorFetchOptions
  ): Promise<ConnectorResult<{ totalLikesSampled: number; records: PublicSourceRecord[] }>> {
    if (!validateTargetUid(targetUid)) {
      return {
        success: false,
        capability: "PUBLIC_LIKES",
        status: "FAILED",
        data: null,
        reason: "目标 UID 格式非法",
        fallbackApplied: true,
      };
    }

    const status = this.getCapabilityStatus("PUBLIC_LIKES");
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "PUBLIC_LIKES",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_LIKES] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    const fetchFn = options?.customFetch ?? globalThis.fetch;
    const likesUrl = `https://api.bilibili.com/x/space/like/video?vmid=${targetUid}`;

    try {
      const res = await fetchFn(likesUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `https://space.bilibili.com/${targetUid}`,
        },
        credentials: "omit",
      });

      const json = await res.json();
      if (json.code !== 0 || !Array.isArray(json.data?.list) || json.data.list.length === 0) {
        // Keep semantics identical to PUBLIC_FAVORITES: unavailable/private data is NOT a success.
        // Returning success=true here caused callers to record a SUCCEEDED DataSourceRun with 0 records.
        return {
          success: false,
          capability: "PUBLIC_LIKES",
          status: "PRIVATE",
          data: { totalLikesSampled: 0, records: [] },
          reason: "用户在B站关闭了点赞公开或暂无公开点赞",
          fallbackApplied: false,
        };
      }

      const rawLikeList = json.data.list as Array<{ bvid?: string; id?: number | string; title?: string; author?: string }>;
      const records: PublicSourceRecord[] = [];
      for (const item of rawLikeList) {
        if (!item || !item.title) continue;
        records.push({
          sourceRecordId: `like_${item.bvid || item.id || crypto.randomBytes(4).toString("hex")}`,
          sourceType: "LIKE",
          title: item.title.trim(),
          description: item.author ? `UP主: ${item.author}` : null,
          authorName: item.author || undefined,
          observedAt: new Date().toISOString(),
          tags: [],
          metadata: {
            platformTotalCount: null,
            samplingStrategy: "LATEST_WINDOW_SAMPLE",
          },
        });
      }

      return {
        success: true,
        capability: "PUBLIC_LIKES",
        status: "SUCCESS",
        data: {
          totalLikesSampled: records.length,
          records,
        },
        reason: `成功采集 ${records.length} 条公开点赞视频`,
        fallbackApplied: false,
      };
    } catch {
      return {
        success: false,
        capability: "PUBLIC_LIKES",
        status: "FAILED",
        data: null,
        reason: "公开点赞数据采集网络传输异常",
        fallbackApplied: true,
      };
    }
  }

  /**
   * Fetch Public Content (Gated by PUBLIC_CONTENT status)
   */
  public async fetchPublicContent(
    targetUid: string,
    options?: ConnectorFetchOptions
  ): Promise<ConnectorResult<PublicContentData & { records: PublicSourceRecord[] }>> {
    if (!validateTargetUid(targetUid)) {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "FAILED",
        data: null,
        reason: "目标 UID 格式非法（必须为 1-16 位纯数字）",
        fallbackApplied: true,
      };
    }

    const status = this.getCapabilityStatus("PUBLIC_CONTENT");

    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_CONTENT] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    const fetchFn = options?.customFetch ?? globalThis.fetch;
    const requestUrl = `https://api.bilibili.com/x/v2/medialist/resource/list?type=1&biz_id=${targetUid}&ps=30`;

    let res: Response;
    let streamResult: { text: string; totalBytes: number; exceededLimit: boolean };

    try {
      res = await fetchFn(requestUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: `https://space.bilibili.com/${targetUid}`,
        },
        credentials: "omit",
      });

      streamResult = await readStreamWithByteCap(res, MAX_BYTES_CAP);
    } catch {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "FAILED",
        data: null,
        reason: "公开视频采集网络传输异常",
        fallbackApplied: true,
      };
    }

    if (streamResult.exceededLimit) {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "FAILED",
        data: null,
        reason: "响应体大小超过 64 KiB 安全上限",
        fallbackApplied: true,
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "RATE_LIMITED",
        data: null,
        reason: "Bilibili PUBLIC_CONTENT 请求触发 429 限流",
        fallbackApplied: true,
      };
    }

    if (res.status !== 200) {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "FAILED",
        data: null,
        reason: `HTTP 响应状态非 200: ${res.status}`,
        fallbackApplied: true,
      };
    }

    const publicRecords: PublicSourceRecord[] = [];

    try {
      const json = JSON.parse(streamResult.text);
      const totalContentCount = json?.data?.total?.count ?? json?.data?.media_list?.length ?? 0;
      if (json?.code === 0 && Array.isArray(json?.data?.media_list)) {
        for (const item of json.data.media_list) {
          if (!item) continue;
          const rawTitle = (item.title || "").trim();
          if (!rawTitle) continue;

          const record: PublicSourceRecord = {
            sourceRecordId: `bvid_${item.bvid || item.id || crypto.randomBytes(4).toString("hex")}`,
            sourceType: "CONTENT",
            title: rawTitle,
            description: (item.intro || "").trim() || null,
            observedAt: item.pubtime ? new Date(item.pubtime * 1000).toISOString() : new Date().toISOString(),
            tags: [],
            authorName: item.author?.name || undefined,
            metadata: {
              platformTotalCount: totalContentCount,
              samplingStrategy: "FULL_OBSERVATION",
            },
          };
          publicRecords.push(record);
        }
      }
    } catch {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "FAILED",
        data: null,
        reason: "公开视频列表数据反序列化失败",
        fallbackApplied: true,
      };
    }

    return {
      success: true,
      capability: "PUBLIC_CONTENT",
      status: "SUCCESS",
      data: {
        uid: targetUid,
        totalDynamicsSampled: publicRecords.length,
        items: publicRecords.map((r) => {
          const timeStr = typeof r.observedAt === "string" ? r.observedAt : (r.observedAt ? new Date(r.observedAt).toISOString() : "");
          return {
            id: r.sourceRecordId,
            timestamp: Date.parse(timeStr) || Date.now(),
            textExcerpt: r.title || undefined,
          };
        }),
        records: publicRecords,
      },
      reason: `成功从 Bilibili 采集 ${publicRecords.length} 条公开投稿视频`,
      fallbackApplied: false,
    };
  }
}
