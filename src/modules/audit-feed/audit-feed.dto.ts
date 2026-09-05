type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? value as JsonRecord : {};

const id = (value: unknown) => {
  const candidate = record(value);
  return String(candidate.id ?? candidate._id ?? value ?? "");
};

const nestedName = (value: unknown) => {
  const source = record(value);
  const user = record(source.userId);
  const name = user.name ?? source.fullName ?? source.name;
  return typeof name === "string" ? name : null;
};

const sensitiveField = /(?:password|token|secret|accountnumber|bank|stack|requestbody|configuration|conditions|metadata|ids?$)/i;
const safeValue = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  if (value instanceof Date) return value.toISOString();
  return "[changed]";
};

const changes = (value: unknown) => {
  const source = record(value);
  const fields = Array.isArray(source.fields)
    ? source.fields.filter((field): field is string => typeof field === "string" && !sensitiveField.test(field))
    : [];
  const before = record(source.before);
  const after = record(source.after);
  return fields.map((field) => ({
    field,
    before: safeValue(before[field]),
    after: safeValue(after[field]),
  }));
};

const generalDomain = (eventType: string, category: string) => {
  if (/^business\.(?:member|membership|invite)\./.test(eventType)) return "member" as const;
  if (/^business\.employee(?:_|\.)/.test(eventType)) return "employee" as const;
  if (category === "business") return "business" as const;
  return "security" as const;
};

const humanize = (action: string) => action.replace(/[._]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export const mapGeneralAuditEvent = (value: unknown) => {
  const event = record(value);
  const action = String(event.eventType ?? "unknown");
  const actorName = nestedName(event.actorBusinessMemberId);
  const subjectMemberName = nestedName(event.subjectBusinessMemberId);
  const employeeName = nestedName(event.employeeId);
  const subjectType = typeof event.subjectType === "string" ? event.subjectType : null;
  const subjectName = subjectMemberName ?? employeeName;
  const safeChanges = changes(event.changes);
  const domain = generalDomain(action, String(event.category ?? ""));
  return {
    id: id(event),
    occurredAt: event.createdAt,
    domain,
    auditType: domain === "member" ? "membership" as const : domain,
    action,
    actor: event.actorBusinessMemberId
      ? { type: "member", displayName: actorName ?? "Business member" }
      : null,
    subject: subjectType
      ? { type: subjectType, displayName: subjectName ?? humanize(subjectType) }
      : null,
    summary: typeof event.summary === "string" && event.summary
      ? event.summary
      : `${humanize(action)}${subjectName ? `: ${subjectName}` : ""}`,
    ...(safeChanges.length ? { changes: safeChanges } : {}),
    ...(typeof event.reason === "string" && event.reason ? { reason: event.reason } : {}),
  };
};

const nullableString = (value: unknown) =>
  typeof value === "string" && value ? value : null;

const policyReference = (event: JsonRecord) => {
  const snapshot = record(event.policySnapshot);
  const current = record(event.policyId);
  const assignment = record(event.after);
  const referenceId = nullableString(snapshot.id) ??
    nullableString(current.id ?? current._id) ??
    nullableString(assignment.policyId);

  if (!referenceId) return null;

  return {
    id: referenceId,
    version:
      typeof snapshot.version === "number"
        ? snapshot.version
        : typeof current.version === "number"
          ? current.version
          : typeof assignment.policyVersion === "number"
            ? assignment.policyVersion
            : null,
    displayName:
      nullableString(snapshot.displayName) ??
      nullableString(current.name) ??
      "Policy",
    description:
      nullableString(snapshot.description) ?? nullableString(current.description),
  };
};

const categoryReference = (event: JsonRecord) => {
  const snapshot = record(event.categorySnapshot);
  const current = record(event.categoryId);
  const assignment = record(event.after);
  const referenceId = nullableString(snapshot.id) ??
    nullableString(current.id ?? current._id) ??
    nullableString(assignment.categoryId);

  if (!referenceId) return null;

  return {
    id: referenceId,
    displayName:
      nullableString(snapshot.displayName) ??
      nullableString(current.name) ??
      "Policy category",
    description:
      nullableString(snapshot.description) ?? nullableString(current.description),
    cardinality:
      snapshot.cardinality === "ONE" || snapshot.cardinality === "MANY"
        ? snapshot.cardinality
        : current.cardinality === "ONE" || current.cardinality === "MANY"
          ? current.cardinality
          : null,
  };
};

export const mapPolicyAuditEvent = (value: unknown, personal = false) => {
  const event = record(value);
  const action = String(event.action ?? "unknown");
  const policy = policyReference(event);
  const category = categoryReference(event);
  const actorSnapshot = record(event.actorSnapshot);
  const employeeSnapshot = record(event.employeeSnapshot);
  const actorName =
    nullableString(actorSnapshot.displayName) ??
    nestedName(event.actorBusinessMemberId);
  const employeeName =
    nullableString(employeeSnapshot.displayName) ?? nestedName(event.employeeId);
  const employeeId =
    nullableString(employeeSnapshot.id) ??
    nullableString(record(event.employeeId).id ?? record(event.employeeId)._id) ??
    (typeof event.employeeId === "string" ? event.employeeId : null);
  const name = policy?.displayName ?? "Policy";
  const ended = /ENDED/.test(action);
  const manual = /MANUAL/.test(action);
  const personalSummary = ended
    ? `${name} ended for you.`
    : action === "ASSIGNMENT_VERSION_UPDATED"
      ? `${name} was updated for you.`
      : `${name} was ${manual ? "manually " : ""}assigned to you.`;
  const organizationSummary = employeeName
    ? ended
      ? `${name} ended for ${employeeName}.`
      : action === "ASSIGNMENT_VERSION_UPDATED"
        ? `${name} was updated for ${employeeName}.`
        : `${name} was ${manual ? "manually " : ""}assigned to ${employeeName}.`
    : `${humanize(action)}: ${name}`;
  const safeChanges = personal ? [] : changes({
    fields: event.changedFields,
    before: event.before,
    after: event.after,
  });
  return {
    id: id(event),
    occurredAt: event.occurredAt,
    domain: "policy" as const,
    auditType: personal ? "personal" as const : "policy" as const,
    action,
    actor: event.actorType
      ? {
          type: String(event.actorType),
          displayName: event.actorType === "user" ? actorName ?? "Business member" : "Aurex policy engine",
        }
      : null,
    subject: employeeId
      ? {
          type: "employee",
          ...(employeeId ? { id: employeeId } : {}),
          displayName: personal ? "You" : employeeName ?? "Employee",
        }
      : {
          type: "policy",
          ...(policy ? { id: policy.id } : {}),
          displayName: name,
        },
    policy,
    category,
    historicalSnapshotAvailable: Boolean(
      Object.keys(record(event.policySnapshot)).length &&
      Object.keys(record(event.categorySnapshot)).length &&
      (!event.employeeId || Object.keys(employeeSnapshot).length),
    ),
    summary: personal ? personalSummary : organizationSummary,
    ...(safeChanges.length ? { changes: safeChanges } : {}),
    ...(typeof event.reason === "string" && event.reason ? { reason: event.reason } : {}),
  };
};

export type AuditFeedItem = ReturnType<typeof mapGeneralAuditEvent> | ReturnType<typeof mapPolicyAuditEvent>;
