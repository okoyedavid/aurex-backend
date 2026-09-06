import type { PolicyRuleCondition } from "../policy-rule/policy-rule.model.js";
import type { AssignmentSnapshot } from "../policy/policy-assignment-transition.js";

export type SandboxEmployee = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  employeeListId: string;
  employeeTypeId: string | null;
  groupIds: string[];
  state: string | null;
  status: string;
  employmentStartDate: string | null;
};

export type SandboxDimension = { id: string; name: string; status: string };

export type SandboxCategory = {
  id: string;
  name: string;
  description: string | null;
  cardinality: "ONE" | "MANY";
  status: string;
};

export type SandboxPolicy = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  configuration?: Record<string, unknown>;
};

export type SandboxRule = {
  id: string;
  policyId: string;
  name: string | null;
  conditions: PolicyRuleCondition[];
  priority: number;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type WarpDemoSeed = {
  businessId: string;
  employee: SandboxEmployee;
  departments: SandboxDimension[];
  employeeTypes: SandboxDimension[];
  groups: SandboxDimension[];
  categories: SandboxCategory[];
  policies: SandboxPolicy[];
  rules: SandboxRule[];
};

export type SandboxAudit = {
  id: string;
  occurredAt: string;
  employeeId: string;
  policyId?: string;
  categoryId?: string;
  action: string;
  entityType: string;
  actorType: "demo" | "worker";
  reason?: string;
  correlationId: string;
};

export type SerializedAssignment = Omit<AssignmentSnapshot, "effectiveFrom" | "effectiveTo" | "resolvedAt"> & {
  effectiveFrom: string;
  effectiveTo: string | null;
  resolvedAt: string;
};

export type WarpDemoSandbox = {
  id: string;
  createdAt: string;
  expiresAt: string;
  mutationCount: number;
  revision: number;
  activeRunId: string | null;
  seed: WarpDemoSeed;
  baselineEmployee: SandboxEmployee;
  employee: SandboxEmployee;
  assignments: SerializedAssignment[];
  audit: SandboxAudit[];
};

export interface WarpDemoRedisClient {
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  get(key: string): Promise<string | null>;
  hset(key: string, values: Record<string, string>): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

