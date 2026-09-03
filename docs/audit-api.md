# Audit API

## Visibility scopes

### Business audit

```http
GET /api/businesses/:businessId/audit
```

Requires `audit_logs:view`. General business events are always separate from
policy administration records. Policy records are added only when the caller
also has `policies:view_audit`.

Query parameters: `page`, `limit`, `domain`, `action`, `actorId`, `employeeId`,
`from`, and `to`. Supported domains are `business`, `member`, `employee`,
`policy`, and `security`.

### Personal audit

```http
GET /api/businesses/:businessId/audit/me
```

Requires an active membership but no audit permission. General records must
explicitly reference the current membership as actor or subject, or reference
the Employee linked to that membership. Policy records are limited to
assignment effects for that linked Employee and are sanitized.

The personal endpoint deliberately accepts no `memberId` or `employeeId`
override.

### Dedicated policy history

The existing policy audit and history endpoints require both
`audit_logs:view` and `policies:view_audit`.

## Compatibility

Older general audit documents do not have the explicit `businessId`, actor,
subject, or employee references introduced for query-safe visibility. They are
retained but are not inferred into business or personal feeds from free-form
metadata. A deliberate migration/backfill would be required to expose legacy
records safely.

Audit responses are safe DTOs. Raw audit documents, metadata, request bodies,
bank details, secrets, stack traces, and policy conditions/configuration are
not returned.
