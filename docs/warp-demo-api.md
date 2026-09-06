# Public Warp demo API

The interactive Warp demo is session-scoped. MongoDB is read only: session creation copies the canonical Maya Patel employee, dimensions, categories, policies, and rules into Redis. Employee facts, assignments, audit evidence, and progress produced after that point belong only to the returned session and expire with it.

All successful responses use `{ "success": true, "data": ... }`.

## Create and initialize a sandbox

```http
POST /api/demo/warp/session
Content-Type: application/json

{}
```

The response contains `sessionId`, `expiresAt`, the baseline `employee`, allowed `controls`, and `initialization: { runId, status: "queued" }`. Poll the initialization run before enabling controls.

Multiple sessions may coexist. A session ID is required on every interactive read and write; the unscoped showcase endpoints remain read-only views of the canonical Mongo seed.

## Session-aware reads

```http
GET /api/demo/warp/session/:sessionId/employee
GET /api/demo/warp/session/:sessionId/employee/policies
GET /api/demo/warp/session/:sessionId/employee/explain
GET /api/demo/warp/session/:sessionId/audit
```

The explanation response includes `evaluatedRules`. Each condition retains its raw
`condition.value` and `actualValue` IDs for machine use and also provides
`expectedDisplayValue` and `actualDisplayValue` for presentation. Display arrays
preserve the corresponding raw-ID order. Missing references use explicit labels
such as `Department unavailable.` rather than substituting Maya's current value.

Do not use `/employees`, `/employees/:employeeId/policies`, `/employees/:employeeId/explain`, or `/audit` to refresh interactive state. Those endpoints intentionally continue to describe the shared, immutable showcase seed.

## Mutate and reset

```http
POST /api/demo/warp/session/:sessionId/mutations
```

```ts
type WarpDemoMutation =
  | { employee: "maya"; field: "department"; value: "engineering" | "finance" }
  | { employee: "maya"; field: "employeeType"; value: "full_time" | "contractor" }
  | { employee: "maya"; field: "state"; value: "california" | "new_york" }
  | { employee: "maya"; field: "remoteGroup"; value: "member" | "not_member" };
```

Mutation responses contain `{ runId, status: "queued" }`.

```http
POST /api/demo/warp/session/:sessionId/reset
Content-Type: application/json

{}
```

Reset restores that session's immutable baseline and returns a new run. It supersedes older in-flight work; the frontend must switch polling to the reset run ID.

## Poll reconciliation

```http
GET /api/demo/warp/session/:sessionId/reconciliation/:runId
```

```ts
type WarpDemoRun = {
  id: string;
  status: "queued" | "running" | "completed" | "completed_with_warnings" | "failed";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  updatedAt: string;
  events: Array<{
    id: string;
    stage: "employee_update" | "queued" | "policy_resolution" | "assignment_reconciliation" | "external_access" | "audit" | "complete";
    status: "pending" | "running" | "success" | "warning" | "failed";
    title: string;
    description: string;
    occurredAt: string;
  }>;
  changedResources: Array<"employee" | "assignments" | "audit">;
  pollAfterMs: number;
};
```

Poll approximately every `pollAfterMs` milliseconds and stop for `completed`, `completed_with_warnings`, or `failed`. A run can only be read through its owning session.

On successful completion, invalidate these React Query keys (or their equivalents):

- `['warp-demo', 'session', sessionId, 'employee']`
- `['warp-demo', 'session', sessionId, 'policies']`
- `['warp-demo', 'session', sessionId, 'explain']`
- `['warp-demo', 'session', sessionId, 'audit']`

The `external_access` event is explicitly simulated. Public demo jobs never create production external-access grants or call GitHub.

Expected errors are `400` unsupported input, `409` in-flight/stale mutation, `410` expired session, `429` session mutation limit, and `503` unavailable Redis/queue/seed data. On `410`, discard local session state and create a new session; an expired sandbox is never restored.
