import crypto from "node:crypto";
import type { ResolvedPolicy } from "./policy-resolver.service.js";

export type AssignmentSnapshot = {
  id: string;
  policyId: string;
  categoryId: string;
  policyVersion: number;
  source: "rule" | "manual";
  winningRuleId: string | null;
  matchedRuleIds: string[];
  status: "active" | "ended";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  resolvedAt: Date;
  createdBy?: string | null;
};

export type AssignmentTransition =
  | { operation: "KEEP"; policyId: string; existing: AssignmentSnapshot }
  | { operation: "CREATE"; policyId: string; assignment: AssignmentSnapshot; desired: ResolvedPolicy }
  | { operation: "END"; policyId: string; before: AssignmentSnapshot; ended: AssignmentSnapshot }
  | { operation: "UPDATE_VERSION"; policyId: string; before: AssignmentSnapshot; ended: AssignmentSnapshot; assignment: AssignmentSnapshot; desired: ResolvedPolicy };

export const assignmentSnapshotChanged = (existing: AssignmentSnapshot, desired: ResolvedPolicy) =>
  existing.policyVersion !== desired.policyVersion ||
  existing.categoryId !== desired.categoryId ||
  (existing.winningRuleId ?? "") !== (desired.winningRuleId ?? "") ||
  existing.source !== desired.source ||
  JSON.stringify([...existing.matchedRuleIds].sort()) !== JSON.stringify([...desired.matchedRuleIds].sort());

export const planAssignmentTransitions = ({
  current,
  desired,
  asOfDate,
  createId = () => crypto.randomUUID(),
}: {
  current: AssignmentSnapshot[];
  desired: ResolvedPolicy[];
  asOfDate: Date;
  createId?: () => string;
}): AssignmentTransition[] => {
  const currentByPolicy = new Map(current.map((assignment) => [assignment.policyId, assignment]));
  const desiredIds = new Set(desired.map((candidate) => candidate.policyId));
  const transitions: AssignmentTransition[] = [];

  for (const candidate of desired) {
    const existing = currentByPolicy.get(candidate.policyId);
    if (existing && !assignmentSnapshotChanged(existing, candidate)) {
      transitions.push({ operation: "KEEP", policyId: candidate.policyId, existing });
      continue;
    }
    const assignment: AssignmentSnapshot = {
      id: createId(),
      policyId: candidate.policyId,
      categoryId: candidate.categoryId,
      policyVersion: candidate.policyVersion,
      source: candidate.source,
      winningRuleId: candidate.winningRuleId,
      matchedRuleIds: [...candidate.matchedRuleIds].sort(),
      status: "active",
      effectiveFrom: asOfDate,
      effectiveTo: null,
      resolvedAt: asOfDate,
      ...(existing?.createdBy ? { createdBy: existing.createdBy } : {}),
    };
    if (!existing) {
      transitions.push({ operation: "CREATE", policyId: candidate.policyId, assignment, desired: candidate });
      continue;
    }
    transitions.push({
      operation: "UPDATE_VERSION",
      policyId: candidate.policyId,
      before: existing,
      ended: { ...existing, status: "ended", effectiveTo: asOfDate, resolvedAt: asOfDate },
      assignment,
      desired: candidate,
    });
  }

  for (const existing of current) {
    if (!desiredIds.has(existing.policyId)) {
      transitions.push({ operation: "END", policyId: existing.policyId, before: existing, ended: { ...existing, status: "ended", effectiveTo: asOfDate, resolvedAt: asOfDate } });
    }
  }
  return transitions;
};
