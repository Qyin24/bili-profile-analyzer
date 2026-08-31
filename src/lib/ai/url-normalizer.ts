/**
 * BiliProfile Analyzer — OpenAI Base URL Normalization
 *
 * Client and Server safe utility for normalizing and validating OpenAI-compatible Base URL syntax.
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
  hostname?: string;
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
  return { valid: true, endpoint, hostname: url.hostname };
}
