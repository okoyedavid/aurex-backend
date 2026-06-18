import { Request } from "express";
import net from "node:net";

const normalizeIpAddress = (ipAddress: string | undefined) => {
  if (!ipAddress) {
    return null;
  }

  const firstAddress = ipAddress.split(",")[0]?.trim();

  if (!firstAddress) {
    return null;
  }

  return firstAddress.replace(/^::ffff:/, "");
};

const getPublicIpAddress = (req: Request) => {
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-forwarded-for"],
    req.headers["x-real-ip"],
    req.ip,
  ].flatMap((value) => (Array.isArray(value) ? value : [value]));

  for (const candidate of candidates) {
    const addresses = typeof candidate === "string" ? candidate.split(",") : [];

    for (const address of addresses) {
      const normalizedAddress = normalizeIpAddress(address);

      if (
        normalizedAddress &&
        net.isIP(normalizedAddress) &&
        !isPrivateIpAddress(normalizedAddress)
      ) {
        return normalizedAddress;
      }
    }
  }

  const fallbackAddress = normalizeIpAddress(req.ip);

  return fallbackAddress &&
    net.isIP(fallbackAddress) &&
    !isPrivateIpAddress(fallbackAddress)
    ? fallbackAddress
    : null;
};
function isPrivateIpAddress(ipAddress: string): boolean {
  if (net.isIPv4(ipAddress)) {
    const parts = ipAddress.split(".").map(Number);

    const first = parts[0];
    const second = parts[1];

    if (first === undefined || second === undefined) {
      return true;
    }

    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (net.isIPv6(ipAddress)) {
    const normalized = ipAddress.toLowerCase();

    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return true;
}

const getDeviceName = (userAgent: string | null) => {
  if (!userAgent) {
    return null;
  }

  const normalizedUserAgent = userAgent.toLowerCase();

  if (normalizedUserAgent.includes("iphone")) {
    return "iPhone";
  }

  if (normalizedUserAgent.includes("ipad")) {
    return "iPad";
  }

  if (normalizedUserAgent.includes("android")) {
    return "Android";
  }

  if (normalizedUserAgent.includes("windows")) {
    return "Windows";
  }

  if (normalizedUserAgent.includes("mac os x")) {
    return "Mac";
  }

  if (normalizedUserAgent.includes("linux")) {
    return "Linux";
  }

  return "Unknown device";
};

const getRequestMetadata = (req: Request) => {
  const userAgent = req.headers["user-agent"] ?? null;
  const ipAddress = getPublicIpAddress(req);

  return {
    requestId: req.id ?? null,
    ipAddress,
    userAgent,
    deviceName: getDeviceName(userAgent),
  };
};

export {
  getRequestMetadata,
  isPrivateIpAddress,
  getPublicIpAddress,
  normalizeIpAddress,
};
