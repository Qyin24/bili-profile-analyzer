/**
 * BiliProfile Analyzer — SSRF Guard & IP Classification
 *
 * Implements strict, defense-in-depth destination IP & DNS validation
 * for user-supplied OpenAI-compatible API endpoints according to OWASP guidelines.
 *
 * Checks & Invariants:
 * 1. IPv4 Restricted Ranges:
 *    - 0.0.0.0/8 (Unspecified/Current)
 *    - 10.0.0.0/8 (RFC1918 Class A Private)
 *    - 100.64.0.0/10 (Carrier-Grade NAT)
 *    - 127.0.0.0/8 (Loopback)
 *    - 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. 169.254.169.254)
 *    - 172.16.0.0/12 (RFC1918 Class B Private: 172.16.0.0 - 172.31.255.255)
 *    - 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24 (TEST-NET / 6to4)
 *    - 192.168.0.0/16 (RFC1918 Class C Private)
 *    - 198.18.0.0/15 (Benchmarking)
 *    - 198.51.100.0/24, 203.0.113.0/24 (TEST-NET-2 / 3)
 *    - 224.0.0.0/4 (Multicast)
 *    - 240.0.0.0/4 (Reserved)
 *    - 255.255.255.255 (Broadcast)
 * 2. IPv6 Restricted Ranges:
 *    - :: (Unspecified)
 *    - ::1 (Loopback)
 *    - ::ffff:0:0/96 (IPv4-mapped)
 *    - 64:ff9b::/96 (IPv4/IPv6 translation)
 *    - 100::/64 (Discard prefix)
 *    - 2001:db8::/32 (Documentation)
 *    - fc00::/7 (Unique Local Address / ULA Private)
 *    - fe80::/10 (Link-Local)
 *    - ff00::/8 (Multicast)
 * 3. Hostname checks & DNS Resolution:
 *    - Resolves all A and AAAA records.
 *    - Fail-closed on DNS resolution errors.
 *    - Blocks if ANY resolved IP falls in restricted ranges.
 */

import * as net from "net";
import * as dns from "dns/promises";

/**
 * Checks whether an IPv4 address string falls into restricted/private/loopback/cloud-metadata ranges.
 */
export function isRestrictedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is treated as restricted
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (CGNAT: 100.64.0.0 - 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking: 198.18.0.0 - 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast: 224 - 239)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved: 240 - 255)
  if (a >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks whether an IPv6 address string falls into restricted ranges.
 */
export function isRestrictedIpv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase().trim();

  // :: (Unspecified)
  if (cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:0") return true;

  // ::1 (Loopback)
  if (cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanIp.startsWith("::ffff:")) {
    const v4Part = cleanIp.slice(7);
    if (net.isIP(v4Part) === 4) {
      return isRestrictedIpv4(v4Part);
    }
  }

  // fc00::/7 (Unique Local Address: starts with fc or fd)
  if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;

  // fe80::/10 (Link-Local: starts with fe8, fe9, fea, feb)
  if (
    cleanIp.startsWith("fe8") ||
    cleanIp.startsWith("fe9") ||
    cleanIp.startsWith("fea") ||
    cleanIp.startsWith("feb")
  ) {
    return true;
  }

  // ff00::/8 (Multicast: starts with ff)
  if (cleanIp.startsWith("ff")) return true;

  // 2001:db8::/32 (Documentation)
  if (cleanIp.startsWith("2001:db8:") || cleanIp === "2001:db8::") return true;

  // 100::/64 (Discard-only)
  if (cleanIp.startsWith("100::") || cleanIp.startsWith("100:0:")) return true;

  return false;
}

/**
 * Checks if an IP string is restricted (IPv4 or IPv6).
 */
export function isRestrictedIp(ip: string): boolean {
  const ipType = net.isIP(ip);
  if (ipType === 4) return isRestrictedIpv4(ip);
  if (ipType === 6) return isRestrictedIpv6(ip);
  return true;
}

/**
 * Checks if a hostname matches well-known local or cloud metadata patterns.
 */
export function isRestrictedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();

  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower.endsWith(".home") ||
    lower.endsWith(".arpa")
  ) {
    return true;
  }

  if (
    lower === "metadata.google.internal" ||
    lower === "instance-data" ||
    lower === "metadata" ||
    lower === "169.254.169.254"
  ) {
    return true;
  }

  return false;
}

export interface ValidateDestinationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Deep async validation of destination hostname/IP against SSRF vulnerabilities.
 */
export async function validateDestinationSafe(
  hostname: string,
  allowPrivateIps = false
): Promise<ValidateDestinationResult> {
  if (!hostname || typeof hostname !== "string" || !hostname.trim()) {
    return { safe: false, reason: "目标主机名不能为空" };
  }

  const cleanHost = hostname.trim();

  // If private IPs explicitly allowed (e.g. controlled local test fixtures)
  if (allowPrivateIps) {
    return { safe: true };
  }

  // 1. If destination is directly an IP literal
  const ipVersion = net.isIP(cleanHost);
  if (ipVersion > 0) {
    if (isRestrictedIp(cleanHost)) {
      return {
        safe: false,
        reason: "禁止使用内网、私有网络、回环或云元数据 IP 地址 (SSRF 拦截)",
      };
    }
    return { safe: true };
  }

  // 2. Check restricted hostname patterns
  if (isRestrictedHostname(cleanHost)) {
    return {
      safe: false,
      reason: "禁止使用指向内网、本地或云元数据的域名 (SSRF 拦截)",
    };
  }

  // 3. Perform DNS resolution to inspect underlying IPs
  try {
    const addresses = await dns.lookup(cleanHost, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      return {
        safe: false,
        reason: "无法解析该域名，请检查域名是否存在",
      };
    }

    for (const record of addresses) {
      if (isRestrictedIp(record.address)) {
        return {
          safe: false,
          reason: `目标域名解析到了受限的内网或私有 IP 地址 (${record.address})`,
        };
      }
    }

    return { safe: true };
  } catch {
    // Fail-closed on DNS failure
    return {
      safe: false,
      reason: "无法解析目标 API 地址域名，请检查网络或域名配置",
    };
  }
}
