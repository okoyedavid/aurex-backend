import crypto from "crypto";
import {
  LocationMetadata,
  RepositoryOptions,
  RequestMetadata,
} from "../../types/repository-types.js";
import { HashService } from "../../utils/hash.js";
import { NotificationService } from "../notification/notification.service.js";
import { AuditEventRepository } from "./audit-event.repository.js";
import { RecordSecurityEvent } from "./audit-event.types.js";

const defaultRequestMetadata: RequestMetadata = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
  deviceName: null,
};

const defaultLocation: LocationMetadata = {
  country: null,
  region: null,
  city: null,
};

type CreateAuditEventServiceDependecies = {
  hashService: HashService;
  notificationService: NotificationService;
  auditEventRepository: AuditEventRepository;
};

const createAuditEventService = ({
  hashService,
  notificationService,
  auditEventRepository,
}: CreateAuditEventServiceDependecies) => {
  const recordSecurityEvent = async ({
    eventType,
    category,
    outcome,
    severity = "info",
    userId,
    email,
    userSessionId,
    authSessionId,
    requestMetadata = defaultRequestMetadata,
    location = defaultLocation,
    reason,
    changes,
    metadata,
    notification,
    mongoSession,
  }: RecordSecurityEvent) => {
    const options: RepositoryOptions = mongoSession
      ? { session: mongoSession }
      : {};
    const auditEvent = await auditEventRepository.createAuditEvent(
      {
        eventId: crypto.randomUUID(),
        eventType,
        category,
        outcome,
        severity,
        userId,
        emailHash: hashService.hashEmail(email),
        userSessionId,
        authSessionId,
        requestId: requestMetadata.requestId ?? null,
        ipAddress: requestMetadata.ipAddress ?? null,
        userAgent: requestMetadata.userAgent ?? null,
        deviceName: requestMetadata.deviceName ?? null,
        city: location.city ?? null,
        region: location.region ?? null,
        country: location.country ?? null,
        reason,
        changes,
        metadata,
      },
      options,
    );

    if (notification && userId && auditEvent) {
      return await notificationService.createNotification(
        {
          userId,
          auditEventId: auditEvent._id,
          type: eventType,
          title: notification.title,
          message: notification.message,
          severity: notification.severity ?? severity,
        },
        options,
      );
    }

    return auditEvent;
  };

  const getUserAuditEvents = (
    userId: string,
    options: RepositoryOptions = {},
  ) => auditEventRepository.findAuditEventsByUserId(userId, options);

  const recordEventSafely = async (payload: RecordSecurityEvent) => {
    try {
      await recordSecurityEvent(payload);
    } catch (error) {
      console.error("Failed to record audit event or notification", error);
    }
  };

  return { getUserAuditEvents, recordEventSafely, recordSecurityEvent };
};

export type AuditEventService = ReturnType<typeof createAuditEventService>;
export { createAuditEventService };
