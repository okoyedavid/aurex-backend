import crypto from "crypto";

import { rateLimit } from "express-rate-limit";

import { getRequestMetadata } from "../utils/request-metadata.js";

import type { Options } from "express-rate-limit";
import { auditEventService } from "../modules/audit-event/audit-event.module.js";
import type { Response, Request } from "express";

const rateLimitAuditTimes = new Map();
const RATE_LIMIT_AUDIT_INTERVAL_MS = 60 * 1000;

const normalizeIdentity = (value: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : "unknown";

const hashIdentity = (value: string) =>
  crypto.createHash("sha256").update(normalizeIdentity(value)).digest("hex");

const buildKey = (req: Request, identity: string) => {
  const { ipAddress } = getRequestMetadata(req);
  return `${ipAddress ?? "unknown-ip"}:${hashIdentity(identity)}`;
};

type CreateLimiter = {
  message: string;
  skipSuccessfulRequests?: boolean;
  limit: number;
  windowMs: number;
  keyGenerator: NonNullable<Options["keyGenerator"]>;
};
const createLimiter = ({
  windowMs,
  limit,
  keyGenerator,
  message,
  skipSuccessfulRequests = false,
}: CreateLimiter) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    skipSuccessfulRequests,
    handler: async (req: Request, res: Response) => {
      const requestMetadata = getRequestMetadata(req);
      const auditKey = `${requestMetadata.ipAddress ?? "unknown-ip"}:${req.method}:${req.originalUrl}`;
      const lastAuditedAt = rateLimitAuditTimes.get(auditKey) ?? 0;
      const shouldAudit =
        Date.now() - lastAuditedAt >= RATE_LIMIT_AUDIT_INTERVAL_MS;

      if (shouldAudit) {
        rateLimitAuditTimes.set(auditKey, Date.now());

        try {
          await auditEventService.recordSecurityEvent({
            eventType: "security.rate_limit.triggered",
            category: "security",
            outcome: "blocked",
            severity: "warning",
            userId: req.user?.id ?? null,
            email: req.body?.email ?? null,
            userSessionId: req.user?.userSessionId ?? null,
            authSessionId: req.user?.sessionId ?? null,
            requestMetadata,
            reason: "rate_limit_exceeded",
            metadata: {
              method: req.method,
              path: req.originalUrl,
            },
          });
        } catch (error) {
          console.error("Failed to write rate-limit audit event", error);
        }
      }

      return res.status(429).json({ message });
    },
  });

const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  keyGenerator: (req: Request) =>
    getRequestMetadata(req).ipAddress ?? "unknown-ip",
  message: "Too many requests. Try again later.",
});

const loginIpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request) =>
    getRequestMetadata(req).ipAddress ?? "unknown-ip",
  message: "Too many login attempts. Try again later.",
});

const loginIdentityLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: (req: Request) => buildKey(req, req.body?.email),
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Try again later.",
});

const otpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: (req: Request) =>
    buildKey(req, req.body?.email ?? req.user?.id),
  message: "Too many verification attempts. Try again later.",
});

const emailDeliveryLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req: Request) =>
    buildKey(req, req.body?.email ?? req.user?.id),
  message: "Too many email requests. Try again later.",
});

const refreshLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request) =>
    getRequestMetadata(req).ipAddress ?? "unknown-ip",
  message: "Too many refresh attempts. Try again later.",
});

const sensitiveActionLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) =>
    buildKey(req, req.user?.id ?? req.body?.email ?? "unknown"),
  message: "Too many sensitive account actions. Try again later.",
});

export {
  emailDeliveryLimiter,
  globalLimiter,
  loginIdentityLimiter,
  loginIpLimiter,
  otpLimiter,
  refreshLimiter,
  sensitiveActionLimiter,
};
