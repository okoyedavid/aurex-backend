# Audit API Upgrade: Historical Policy Snapshots

## Status

This document describes an additive upgrade to the already implemented Audit
API contract in `docs/audit-api.md`. It does not replace the original contract.

## Problem

Policy assignment audit events previously exposed only the frontend fields
`actor`, `subject`, `summary`, and `changes`. The `subject` is the affected
employee, not the assigned policy. Inferring the policy from `subject` can
therefore produce incorrect text such as:

```text
Emeka Okoye was assigned to this employee.
```

Resolving only a stored policy ID against the current policy is also
historically unsafe. A policy named `GitLab access` when assigned might later
be renamed to `GitHub access`, archived, or deleted.

## Response patch

Policy events returned by the organization audit, personal audit, and dedicated
policy history endpoints now add immutable `policy` and `category` references.
The employee remains the `subject`.

```json
{
  "action": "ASSIGNMENT_CREATED",
  "actor": {
    "type": "worker",
    "displayName": "Aurex policy engine"
  },
  "subject": {
    "type": "employee",
    "id": "employee-id",
    "displayName": "Emeka Okoye"
  },
  "policy": {
    "id": "policy-id",
    "version": 1,
    "displayName": "GitLab access",
    "description": "Engineering source-control access"
  },
  "category": {
    "id": "category-id",
    "displayName": "Application access",
    "description": "Access to company applications",
    "cardinality": "MANY"
  },
  "historicalSnapshotAvailable": true,
  "summary": "GitLab access was assigned to Emeka Okoye."
}
```

For the personal endpoint, the same immutable policy and category objects are
returned while the employee is presented as `You`:

```json
{
  "subject": {
    "type": "employee",
    "id": "employee-id",
    "displayName": "You"
  },
  "policy": {
    "id": "policy-id",
    "version": 1,
    "displayName": "GitLab access",
    "description": "Engineering source-control access"
  },
  "summary": "GitLab access was assigned to you."
}
```

## Snapshot semantics

New policy audit records capture these values at event creation time:

- Actor ID, type, and display name.
- Employee ID and display name when an employee is affected.
- Policy ID, version, display name, and description.
- Category ID, display name, description, and cardinality.

These snapshots are immutable. Subsequent edits or deletion of the referenced
employee, policy, category, user, or business member do not alter the event's
historical presentation.

For policy or category update events, the snapshot represents the entity after
the audited change. The existing sanitized `changes` array continues to provide
the allowed before-and-after field comparison.

## Legacy compatibility

Events created before this upgrade have no immutable snapshots. For those
events, the API falls back to the currently populated policy, category, actor,
and employee values when their referenced documents still exist.

Legacy events return:

```json
{
  "historicalSnapshotAvailable": false
}
```

Clients must not treat names on such legacy events as historically
authoritative. A former name cannot be reconstructed reliably from an ID after
the source entity has changed. No automatic backfill should guess these values.

## Endpoint coverage

The additive fields apply to policy events returned by:

```http
GET /api/businesses/:businessId/audit
GET /api/businesses/:businessId/audit/me
```

They also apply to dedicated policy audit/history responses because those
responses use the same policy-audit DTO mapper.

## Frontend requirement

The timeline should use `summary` as authoritative display text. If it needs a
structured presentation, it must use `policy` for the policy identity and
`subject` for the affected employee. It must never infer a policy from
`subject`.
