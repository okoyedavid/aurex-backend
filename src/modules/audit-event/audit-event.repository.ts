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

export type BusinessAuditFilters = {
  domain?: "business" | "member" | "employee" | "security";
  action?: string;
  actorId?: string;
  employeeId?: string;
  from?: Date;
  to?: Date;
};

const businessAuditQuery = (
  businessId: string,
  filters: BusinessAuditFilters,
): QueryFilter<AuditEventDocument> => {
  const query: QueryFilter<AuditEventDocument> = { businessId };
  const conditions: QueryFilter<AuditEventDocument>[] = [];
  if (filters.action) conditions.push({ eventType: filters.action });
  if (filters.actorId) query.actorBusinessMemberId = filters.actorId;
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.from || filters.to) {
    query.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lt: filters.to } : {}),
    };
  }
  if (filters.domain === "member") conditions.push({ eventType: /^business\.(?:member|membership|invite)\./ });
  if (filters.domain === "employee") conditions.push({ eventType: /^business\.employee(?:_|\.)/ });
  if (filters.domain === "business") {
    query.category = "business";
    conditions.push({ eventType: { $not: /^business\.(?:member|membership|invite|employee)/ } });
  }
  if (filters.domain === "security") {
    query.category = { $in: ["security", "authentication", "account", "session"] };
  }
  if (conditions.length) query.$and = conditions;
  return query;
};

const listBusinessAuditEvents = (
  businessId: string,
  filters: BusinessAuditFilters,
  limit: number,
) =>
  AuditEvent.find(businessAuditQuery(businessId, filters))
    .populate({ path: "actorBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "subjectBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "employeeId", select: "fullName" })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit);

const countBusinessAuditEvents = (businessId: string, filters: BusinessAuditFilters) =>
  AuditEvent.countDocuments(businessAuditQuery(businessId, filters));

const personalAuditQuery = (
  businessId: string,
  memberId: string,
  employeeId?: string,
): QueryFilter<AuditEventDocument> => ({
  businessId,
  $or: [
    { actorBusinessMemberId: memberId },
    { subjectBusinessMemberId: memberId },
    ...(employeeId ? [{ employeeId }] : []),
  ],
});

const listPersonalAuditEvents = (
  businessId: string,
  memberId: string,
  employeeId: string | undefined,
  limit: number,
) =>
  AuditEvent.find(personalAuditQuery(businessId, memberId, employeeId))
    .populate({ path: "actorBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "subjectBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "employeeId", select: "fullName" })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit);

const countPersonalAuditEvents = (
  businessId: string,
  memberId: string,
  employeeId?: string,
) => AuditEvent.countDocuments(personalAuditQuery(businessId, memberId, employeeId));

export const auditEventRepository = {
  createAuditEvent,
  countBusinessAuditEvents,
  countPersonalAuditEvents,
  findAuditEventsByUserId,
  listBusinessAuditEvents,
  listPersonalAuditEvents,
};

export type AuditEventRepository = typeof auditEventRepository;
