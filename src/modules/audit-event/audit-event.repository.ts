import type { QueryFilter } from "mongoose";
import {
  AuditEvent,
  AuditEventDocument,
  CreateAuditEventPayload,
} from "./audit-event.model.js";
import { RepositoryOptions } from "../../types/repository-types.js";

type FindAuditEventsOptions = RepositoryOptions & {
  limit?: number;
  before?: Date;
};

const createAuditEvent = (
  payload: CreateAuditEventPayload,
  options: RepositoryOptions = {},
) => AuditEvent.create([payload], options).then(([event]) => event);

const findAuditEventsByUserId = (
  userId: string,
  { limit = 50, before, ...options }: FindAuditEventsOptions = {},
) => {
  const filter: QueryFilter<AuditEventDocument> = { userId };

  if (before) {
    filter.createdAt = { $lt: before };
  }

  return AuditEvent.find(filter, null, options)
    .sort({ createdAt: -1 })
    .limit(limit);
};

export const auditEventRepository = {
  createAuditEvent,
  findAuditEventsByUserId,
};

export type AuditEventRepository = typeof auditEventRepository;
