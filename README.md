# Aurex Backend

Aurex is a multi-tenant business operations backend built with Express, TypeScript,
MongoDB, and Mongoose. It demonstrates authentication, persistent sessions,
permission-based business access, custom roles, delegated invitation approval,
employee bank-account verification, notifications, audit trails, and defensive API
design.

The repository is intended as a portfolio-quality backend and as the API for the
Aurex frontend. Payment and invoice permissions exist in the role vocabulary, but
payment execution and invoice workflows are not implemented yet.

## Contents

- [Features](#features)
- [Technology](#technology)
- [Architecture](#architecture)
- [Security Model](#security-model)
- [Core Workflows](#core-workflows)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database and Role Setup](#database-and-role-setup)
- [Running the Application](#running-the-application)
- [API Conventions](#api-conventions)
- [API Reference](#api-reference)
- [Workers](#workers)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Deployment Notes](#deployment-notes)
- [Known Remaining Work](#known-remaining-work)

## Features

### Identity and account security

- User registration with password hashing.
- Email verification with expiring one-time passwords.
- Login with short-lived access tokens and rotating refresh sessions.
- Persistent device/user sessions and individual session revocation.
- Password reset, authenticated password change, and email change workflows.
- Profile, avatar, and user-preference updates.
- Login, OTP, refresh, email-delivery, and sensitive-action rate limits.
- Request metadata capture for security events.

### Multi-tenant businesses

- Business creation and membership-based access.
- Business creation can include up to ten employee lists, each with up to fifty
  employees.
- The creator receives the global Owner role transactionally.
- Business list responses include the caller's membership and populated role so a
  frontend can derive navigation and action visibility.

### Roles and permissions

- Global, seeded system roles.
- Business-owned custom roles.
- Explicit granted and denied permissions.
- Effective permissions are grants minus explicit denials.
- Permission middleware protects every business route.
- A user cannot create, update, approve, or assign a role containing effective
  permissions they do not possess.
- System roles are read-only.
- Custom role deletion is implemented as archival so historical references remain
  valid.

### Invitations and approval

- Invitations can target registered or unregistered email addresses.
- Recipients can view, accept, or reject their invitations after authenticating with
  the invited email address.
- An inviter with sufficient `roles:assign` authority can create immediate membership
  when the recipient accepts.
- Otherwise, acceptance records the recipient's intent and enters a pending approval
  state without creating membership.
- An authorized approver must possess every effective permission in the requested
  role before approving it.
- Invitation and approval events generate best-effort audit events and personal
  notifications outside the membership transaction.

### Business members

- Paginated member listing and detailed member inspection.
- Role reassignment with privilege-subset validation.
- Membership suspension and reactivation.
- Soft removal preserving history.
- Self-mutation protection.
- Owner protection.
- Lower-privileged members cannot modify members whose role contains permissions they
  do not possess.
- Mutation actor and timestamp metadata are stored directly on the membership.

### Employees and bank verification

- Paginated employee-list and employee APIs.
- Bulk nested creation during business creation.
- Maximum employee limits enforced by validation.
- Asynchronous bank-account verification worker.
- Atomic job claiming prevents two application instances from processing the same
  employee concurrently.
- Exponential retry behavior for retryable provider failures.
- Verification progress and payment readiness are aggregated onto the employee list.
- Paystack demo mode uses the configured test bank code for portfolio development.

### Notifications and auditing

- Personal notification inbox with pagination and unread counts.
- Idempotent mark-as-read and mark-all-read operations.
- Notification ownership is always scoped to the authenticated user.
- Security, account, invitation, approval, membership, and member-mutation audit
  events.
- Notifications reference their originating audit event.
- Notification failure cannot roll back a successful membership operation.

## Technology

| Concern | Technology |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript, strict mode |
| HTTP framework | Express 5 |
| Database | MongoDB |
| ODM | Mongoose |
| Validation | Zod |
| Authentication | JSON Web Tokens and HTTP cookies |
| Password hashing | bcryptjs |
| Email provider | Resend-compatible HTTP API |
| Bank resolution | Paystack |
| Tests | Vitest and Supertest |
| Security middleware | Helmet, CORS, rate limiting, Mongo sanitization |

## Architecture

The application uses feature modules. Most modules follow the same dependency flow:

```text
route
  -> authentication/validation/permission middleware
  -> controller
  -> service
  -> repository
  -> Mongoose model
```

### Responsibilities

- **Routes** define HTTP methods, paths, middleware ordering, and permissions.
- **Validators** parse body, params, and query data into trusted values.
- **Controllers** translate HTTP input into service calls and build response envelopes.
- **Services** contain authorization invariants, workflow decisions, and orchestration.
- **Repositories** own MongoDB query details and business-scoped filters.
- **Models** define persistence constraints, indexes, enums, and JSON transforms.
- **Modules** construct services/controllers with explicit dependencies.

Services are factories rather than hidden classes. This makes dependencies explicit
and allows focused unit tests with fake repositories.

### Transaction boundary

MongoDB transactions are used when multiple authoritative records must change as one
operation. Examples include:

- Creating a business and its Owner membership.
- Accepting an immediately assignable invitation and creating/reactivating membership.
- Approving a pending invitation and creating/reactivating membership.

Email delivery, audit events, and notifications are external or secondary side
effects. They are deliberately executed outside authoritative membership transactions.
A notification failure is logged and must not undo valid business state.

## Security Model

### Authentication

Protected routes accept the access token from either:

```http
Authorization: Bearer <access-token>
```

or the configured `accessToken` cookie. Refresh and logout use the `refreshToken`
cookie. The authentication middleware also verifies that the underlying user session
is still active.

### Business authorization

Authentication answers "who is the caller?" Business permission middleware then
answers "may this active member perform this action for this business?"

Every business authorization query includes `businessId` and `userId`. Resource
queries additionally include the owning `businessId`, preventing an ID from another
business from being used against the current route.

### Effective permissions

```text
effective permissions = role.permissions - role.deniedPermissions
```

Explicit denial wins over a grant.

### Permission-subset invariant

Role assignment and role definition use this invariant:

```text
target role effective permissions must be a subset of actor effective permissions
```

`roles:assign` alone is not unrestricted authority. A caller may have
`roles:assign` and still be unable to assign a role containing a permission they do
not personally possess.

### Owner protection

The Owner role is global and seeded. It cannot be:

- Assigned through a normal invitation.
- Assigned through member role mutation.
- Edited or archived through custom-role routes.
- Suspended, reassigned, or removed through member mutation routes.

Ownership transfer would require a separate, purpose-built workflow and is not
implemented.

### Member hierarchy protection

Before role, status, or removal mutations, the service compares the actor's effective
permissions with the target member's effective permissions. A lower-privileged member
cannot manage a higher-privileged member even if the lower role was mistakenly given
a mutation command permission.

### Request hardening

- Helmet security headers.
- Configured CORS origin with credentials support.
- 10 KB JSON and URL-encoded body limits.
- Mongo query sanitization.
- Global and route-specific rate limits.
- Strict Zod object validation for mutation payloads.
- Mongo ObjectId validation before repository access.
- Passwords and sensitive invite token hashes are not serialized.

## Core Workflows

### Business creation

```text
Authenticated user submits business
  -> business is inserted
  -> seeded global Owner role is loaded
  -> Owner membership is inserted
  -> optional employee lists/employees are inserted
  -> transaction commits
```

The global system roles must be seeded before creating businesses.

### Invitation acceptance

```text
Invite created for email + role
  -> recipient accepts using the matching authenticated email
  -> inviter authority is re-evaluated at acceptance time
      -> has roles:assign and permission subset passes
          -> membership created/reactivated transactionally
      -> otherwise
          -> invitation becomes accepted + approval pending
          -> no membership exists yet
```

Rechecking at acceptance prevents stale authority from being trusted when an inviter's
role changes after sending an invitation.

### Pending approval

```text
Accepted invitation awaiting approval
  -> approver must have roles:assign
  -> requested role must still exist and be active
  -> requested permissions must be a subset of approver permissions
  -> membership created/reactivated and invite approved in one transaction
```

### Member mutation

Role mutation requires both:

```text
members:update_role
roles:assign
```

Status mutation requires:

```text
members:update_status
```

Removal requires:

```text
members:remove
```

Removal is soft: `status` becomes `removed`, and removal actor/time metadata is
retained. Removed memberships cannot be modified through status or role routes. A
future invitation may reactivate the same unique business/user membership.

### Employee bank verification

New or bank-edited employees enter a pending verification state. The in-process
worker atomically claims one eligible employee, resolves the account, writes success
or failure state, and refreshes aggregate progress on the employee list.

Retryable errors use capped exponential backoff. Definitive invalid responses are
recorded and processing continues to other employees; one invalid employee does not
block the queue.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- MongoDB.
- A replica set or MongoDB Atlas deployment for transaction-backed workflows.
- A MaxMind GeoLite2 City database file if location enrichment is enabled.
- Optional Resend credentials for real email delivery.
- Optional Paystack credentials for live bank resolution.

A standalone MongoDB server does not support transactions. For local transaction
testing, run MongoDB as a single-node replica set or use an Atlas development cluster.

## Installation

```bash
git clone <repository-url>
cd aurex-backend
npm install
```

Create the local environment file from the example:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Set secure JWT secrets and a usable MongoDB connection before starting the server.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes | `development`, `test`, or `production`. |
| `PORT` | Yes | HTTP server port. Defaults to `5000` in configuration. |
| `CLIENT_URL` | Yes | Allowed browser origin and frontend base URL. |
| `APP_NAME` | Yes | Product name used in email content. |
| `RELEASE` | Yes | Release identifier displayed by health/status tooling. |
| `MONGO_URI` | Yes | MongoDB connection URI. Use a replica set for transactions. |
| `JWT_ACCESS_SECRET` | Yes | Independent secret of at least 32 characters. |
| `JWT_REFRESH_SECRET` | Yes | Independent secret of at least 32 characters. |
| `JWT_EXPIRES_IN` | Yes | Access-token lifetime such as `15m`. |
| `REFRESH_TOKEN_EXPIRES_IN` | Yes | Refresh lifetime such as `7d`. |
| `MAXMIND_DB_PATH` | Yes | Path to the GeoLite2 City database. |
| `RESEND_API_KEY` | Production email | Resend API key. |
| `EMAIL_FROM` | Production email | Verified sender, for example `Aurex <no-reply@example.com>`. |
| `EMAIL_DELIVERY_OVERRIDE_TO` | No | Routes all outgoing email to one test inbox. |
| `CLOUDINARY_CLOUD_NAME` | Image uploads | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Image uploads | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Image uploads | Cloudinary secret. |
| `PAYSTACK_BASE_URL` | Yes | Defaults to `https://api.paystack.co`. |
| `PAYSTACK_PUBLIC_KEY` | No | Public Paystack key for future frontend use. |
| `PAYSTACK_SECRET_KEY` | Bank resolution | Secret Paystack key. |
| `PAYSTACK_VERIFICATION_MODE` | Yes | `demo` or `live`. |
| `PAYSTACK_TEST_BANK_CODE` | Demo mode | Test bank code, normally `001`. |
| `VERIFICATION_WORKER_INTERVAL_MS` | Yes | Employee verification polling interval; minimum 500 ms. |
| `VERIFICATION_MAX_ATTEMPTS` | Yes | Maximum attempts for retryable bank verification. |

Never commit `.env`, production credentials, JWT secrets, or provider keys.

### Email behavior

When the email provider or sender is missing outside production, verification and
invitation email methods use a development console fallback. Invitation URLs/tokens
are intentionally not printed by the invitation email fallback.

In production, missing email configuration is an operational error.

### Paystack modes

- `demo` substitutes `PAYSTACK_TEST_BANK_CODE` when resolving accounts. This supports
  portfolio development with Paystack's test behavior.
- `live` sends the employee's real bank code and requires valid live credentials.

## Database and Role Setup

System roles are global records with `businessId: null`. Seed them after configuring
the database and whenever the system permission definitions change:

```bash
npm run seed:roles
```

The seed is idempotent and updates existing system-role permission arrays.

The application does not create per-business copies of system roles. Business
members reference the global role or a custom role owned by their business.

Important indexes include:

- Unique business membership by `(businessId, userId)`.
- Unique global system role keys.
- Unique custom role keys within a business.
- Unique employee-list names within a business.
- Unique invite token hashes.
- Partial uniqueness for pending invitations by business and email.
- Worker indexes over verification status and next-attempt time.

## Running the Application

Start development mode:

```bash
npm run dev
```

Compile TypeScript:

```bash
npm run build
```

Run compiled output:

```bash
npm start
```

Run tests:

```bash
npm test
```

Run one test file:

```bash
npm test -- src/modules/business-member/business-member.mutation.route.test.ts --run
```

## API Conventions

### Base URL

Local default:

```text
http://localhost:5000
```

### Successful response envelope

Most feature routes return:

```json
{
  "success": true,
  "message": "Resource retrieved",
  "data": {}
}
```

Paginated resources return:

```json
{
  "success": true,
  "message": "Resources retrieved",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

### Validation errors

Validation failures use HTTP `400` and include Zod field/form details:

```json
{
  "message": "Validation failed",
  "requestId": "request-id",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email address"]
    }
  }
}
```

### Common status codes

| Status | Meaning |
| --- | --- |
| `200` | Successful read or mutation. |
| `201` | Resource created. |
| `400` | Invalid request or non-assignable input. |
| `401` | Missing/invalid authentication. |
| `403` | Authenticated but not authorized. |
| `404` | Resource not found within the caller's scope. |
| `409` | Current resource state conflicts with the operation. |
| `410` | Invitation expired. |
| `429` | Rate limit exceeded. |
| `500` | Unexpected server/configuration error. |

### IDs

API JSON transforms expose Mongo document identifiers as `id`. `_id` is removed from
primary serialized models. Populated relationship properties retain their schema
names, such as `roleId`, `userId`, and `businessId`, while containing populated
objects.

### Pagination

Paginated endpoints accept positive `page` and `limit` query parameters. The usual
default is `page=1&limit=20`, with a maximum limit of 100.

## API Reference

All `/api/me/*` routes are user-owned and authenticated unless stated otherwise.
Business routes additionally enforce the permission shown in parentheses.

### Health

```http
GET /                         # basic API response
GET /api/health               # machine-readable health
GET /status                   # HTML status page
```

### Authentication

```http
GET   /api/auth/me
POST  /api/auth/register
POST  /api/auth/login
POST  /api/auth/refresh
POST  /api/auth/logout
POST  /api/auth/verify-email
POST  /api/auth/resend-email
POST  /api/auth/password/forgot
PATCH /api/auth/password/reset
```

Registration example:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "Password123!"
}
```

Registration sends a verification OTP but does not automatically authenticate the
user. Login creates persistent user/auth session records and sets access/refresh
cookies.

### Account

```http
PATCH  /api/me
PATCH  /api/me/avatar
DELETE /api/me/avatar
PATCH  /api/me/preferences
POST   /api/me/email/change
PATCH  /api/me/email/change
PATCH  /api/me/password
```

The email-change `POST` requests an OTP; the `PATCH` verifies it and commits the new
email.

### Sessions

```http
GET    /api/me/sessions
DELETE /api/me/sessions
DELETE /api/me/sessions/:userSessionId
```

Deleting `/api/me/sessions` revokes other sessions while retaining the current one.
Deleting a specific current session clears authentication cookies.

### Businesses

```http
GET    /api/businesses
POST   /api/businesses
GET    /api/businesses/:businessId
PATCH  /api/businesses/profile-image
DELETE /api/businesses/profile-image
```

Create-business example:

```json
{
  "name": "Aurex Labs",
  "industry": "technology",
  "employeeLists": [
    {
      "name": "Engineering Payroll",
      "currency": "NGN",
      "payFrequency": "monthly",
      "employees": [
        {
          "fullName": "Ada Okafor",
          "jobTitle": "Engineer",
          "bankCode": "058",
          "bankName": "Guaranty Trust Bank",
          "accountNumber": "5801017089",
          "amount": 250000,
          "currency": "NGN",
          "payFrequency": "monthly"
        }
      ]
    }
  ]
}
```

Business creation accepts zero employee lists, empty lists, or lists containing
employees. It supports at most ten lists and at most fifty employees per list.

### Business members

```http
GET    /api/businesses/:businessId/members
        permission: members:view

GET    /api/businesses/:businessId/members/:memberId
        permission: members:view

PATCH  /api/businesses/:businessId/members/:memberId/role
        permissions: members:update_role + roles:assign

PATCH  /api/businesses/:businessId/members/:memberId/status
        permission: members:update_status

DELETE /api/businesses/:businessId/members/:memberId
        permission: members:remove
```

Role update body:

```json
{
  "roleId": "role-object-id"
}
```

Status update body:

```json
{
  "status": "suspended"
}
```

Allowed status mutation values are `active` and `suspended`. Removal uses the DELETE
route and produces `status: "removed"` without deleting the document.

Mutation responses include populated user/role/business data and metadata such as:

```json
{
  "roleUpdatedByUserId": {
    "id": "actor-user-id",
    "name": "Owner",
    "email": "owner@example.com"
  },
  "roleUpdatedAt": "2026-06-30T12:00:00.000Z",
  "statusUpdatedByUserId": null,
  "statusUpdatedAt": null,
  "removedByUserId": null,
  "removedAt": null
}
```

Administrative mutation routes cannot mutate the caller's own membership. A future
leave-business or ownership-transfer workflow should use separate endpoints.

### Roles

```http
GET    /api/businesses/:businessId/roles
        permission: roles:view

GET    /api/businesses/:businessId/roles/assignable
        permission: members:invite

POST   /api/businesses/:businessId/roles
        permission: roles:create

GET    /api/businesses/:businessId/roles/:roleId
        permission: roles:view

PATCH  /api/businesses/:businessId/roles/:roleId
        permission: roles:update

DELETE /api/businesses/:businessId/roles/:roleId
        permission: roles:delete
```

Custom-role example:

```json
{
  "name": "Payroll Assistant",
  "permissions": ["members:view", "employee_lists:view", "employees:view"],
  "deniedPermissions": []
}
```

Denied permissions must also appear in the grants array. The assignable-role endpoint
excludes Owner and adds `requiresApproval` for the current caller. This endpoint is
designed for invitation forms.

`DELETE` archives a custom role. It returns `409` while the role is assigned to an
active/suspended member or referenced by an open invitation.

### Business invitations

Business-side routes:

```http
GET  /api/businesses/:businessId/invites
      permission: members:invite

POST /api/businesses/:businessId/invites
      permission: members:invite

GET  /api/businesses/:businessId/invites/pending-approval
      permission: roles:assign

POST /api/businesses/:businessId/invites/:inviteId/approve
      permission: roles:assign

POST /api/businesses/:businessId/invites/:inviteId/reject-approval
      permission: roles:assign
```

Personal recipient routes:

```http
GET  /api/me/business-invites
POST /api/me/business-invites/:inviteId/accept
POST /api/me/business-invites/:inviteId/reject
```

Create body:

```json
{
  "email": "new.member@example.com",
  "roleId": "role-object-id"
}
```

The recipient must authenticate with the invited email. Accept responses include:

```json
{
  "success": true,
  "message": "Business invitation accepted",
  "data": {
    "status": "accepted",
    "approvalStatus": "pending"
  },
  "meta": {
    "membershipCreated": false
  }
}
```

When `membershipCreated` is false, the frontend must not grant business access
optimistically. The accepted invitation remains pending until approval.

Invitation status values:

```text
pending | accepted | rejected | revoked | expired
```

Approval status values:

```text
not_required | pending | approved | rejected
```

Email delivery status values:

```text
pending | retrying | sent | failed
```

### Employee lists

```http
GET   /api/businesses/:businessId/employee-lists
POST  /api/businesses/:businessId/employee-lists
GET   /api/businesses/:businessId/employee-lists/:employeeListId
PATCH /api/businesses/:businessId/employee-lists/:employeeListId
GET   /api/businesses/:businessId/employee-lists/:employeeListId/verification-status
```

Permissions are `employee_lists:view`, `employee_lists:create`, and
`employee_lists:update` according to operation.

Create-list body may include up to fifty employees:

```json
{
  "name": "Operations Payroll",
  "description": "Monthly operations payroll",
  "currency": "NGN",
  "payFrequency": "monthly",
  "employees": []
}
```

### Employees

```http
GET   /api/businesses/:businessId/employee-lists/:employeeListId/employees
POST  /api/businesses/:businessId/employee-lists/:employeeListId/employees
GET   /api/businesses/:businessId/employee-lists/:employeeListId/employees/:employeeId
PATCH /api/businesses/:businessId/employee-lists/:employeeListId/employees/:employeeId
```

Permissions are `employees:view`, `employees:create`, and `employees:update`.

Employee bank fields are client input, but verification fields are server-owned. The
frontend must not claim an account is verified by sending verification status or
resolved account-name fields.

### Notifications

```http
GET   /api/me/notifications?page=1&limit=20&unreadOnly=false
PATCH /api/me/notifications/read-all
PATCH /api/me/notifications/:notificationId/read
```

List response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "unreadCount": 0,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

Notifications are personal, not business-owned. Business-wide event history belongs
to audit logs. A business dashboard bell should still display the authenticated
user's personal notifications.

### Paystack

```http
GET /api/paystack/banks
GET /api/paystack/bank-account/resolve
```

Bank listing is public. Direct account resolution requires authentication. Employee
verification normally goes through the worker rather than trusting frontend-provided
resolution results.

## Workers

### Employee verification worker

The employee verification worker starts with the HTTP server when Paystack is
configured. It:

1. Atomically claims one eligible pending/retrying employee.
2. Marks/increments processing state through the repository.
3. Calls Paystack resolution.
4. Compares the resolved account number with the requested number.
5. Stores the resolved account name only on verified success.
6. Records definitive failure or schedules retryable failure.
7. Recalculates employee-list aggregate progress and payment readiness.

The timer is unreferenced so it does not keep Node alive during shutdown/tests.

### Invitation email worker

The invitation email service is implemented, including HTML escaping, delivery
override support, and safe provider errors. The durable invitation email worker is
the principal remaining backend item.

That worker should:

1. Atomically claim `pending` or eligible `retrying` invitation delivery jobs.
2. Move delivery state to `retrying`/processing ownership safely.
3. Generate a cryptographically random raw invitation token.
4. Replace the placeholder `tokenHash` with the hash of that raw token.
5. Construct the frontend invitation URL without persisting or logging the raw token.
6. Call `emailService.sendBusinessInviteEmail`.
7. On success, set `emailDeliveryStatus: "sent"` and delivery timestamps.
8. On retryable failure, increment attempts and schedule retry with capped backoff.
9. On exhaustion/definitive failure, set `emailDeliveryStatus: "failed"` and store a
   sanitized reason.
10. Recover jobs abandoned in `retrying` if a worker process terminates unexpectedly.

The API currently supports dashboard acceptance by authenticated invite ID. Token URL
inspection/acceptance routes should be added alongside the email worker if emailed
links are intended to accept directly.

## Testing

The test suite uses Vitest and Supertest. Route tests connect to the MongoDB URI from
`.env.test`; use a dedicated test database.

```bash
npm test
```

Focused examples:

```bash
npm test -- src/modules/business-invite/business-invite.route.test.ts --run
npm test -- src/modules/business-member/business-member.mutation.route.test.ts --run
npm test -- src/modules/email/email.service.test.ts --run
```

Coverage includes:

- Authentication and session behavior.
- Business creation with nested employee lists/employees.
- Employee-list and employee dedicated routes.
- Business member listing/details.
- Role CRUD and system-role immutability.
- Permission escalation rejection.
- Immediate and approval-required invitation acceptance.
- Approval and approval rejection.
- Notification ownership, pagination, unread state, and idempotent reads.
- Invitation email formatting, escaping, override behavior, and URL validation.
- Member role/status/removal mutations.
- Self, Owner, cross-business, and hierarchy protections.

### Testing strategy

- **Service tests** inject fake repositories/providers into service factories.
- **Route tests** use Supertest against the real Express app.
- **Database integration tests** verify indexes, population, transactions, and scoped
  mutations against a dedicated MongoDB database.

Do not point `.env.test` at development or production data.

## Project Structure

```text
src/
  app.ts                              Express app and route registration
  server.ts                           Database/startup/worker bootstrap
  config/
    env.ts                            Environment parsing and validation
    db.ts                             MongoDB connection
  middleware/
    auth.middleware.ts                Access token + active session protection
    business-permission.middleware.ts Active membership/RBAC enforcement
    validate-middleware.ts            Zod request parsing
    rate-limit.middleware.ts          Global and sensitive-route limits
    request-context.middleware.ts     Request metadata
    mongo-sanitize.middleware.ts      Query sanitization
    error-handle.middleware.ts        Central error response/persistence
  modules/
    account/                          Profile, password, preferences, email changes
    auth/                             Register/login/refresh/verification/reset
    session/                          Session listing and revocation
    users/                            User model and repository
    business/                         Business creation/list/context
    business-member/                  Membership reads and mutations
    role/                             Global/custom role management
    business-invite/                  Invitation and approval workflow
    employee-list/                    Payroll/employee grouping
    employee/                         Employee CRUD and verification worker
    paystack/                         Bank listing and account resolution adapter
    email/                            Resend provider and email templates
    notification/                     Personal notification inbox
    audit-event/                      Security/business audit events
    application-error/                Server-side error persistence
    health/                           Health and status endpoints
  services/
    cloudinary.service.ts             Image provider integration
    ip-location.service.ts            MaxMind request enrichment
  types/                              Shared repository/request metadata types
  utils/                              JWT, hashing, cookies, transactions, errors
scripts/
  seed-system-roles.ts                Idempotent global-role seed
tests/
  setup/                              Shared Vitest Mongo setup
```

## Deployment Notes

1. Provision MongoDB with transaction support.
2. Configure all required environment variables.
3. Download/provide the MaxMind database expected by `MAXMIND_DB_PATH`.
4. Run the system-role seed against the deployment database.
5. Build TypeScript.
6. Start `dist/server.js`.
7. Configure the frontend origin exactly in `CLIENT_URL`.
8. Use HTTPS and secure cookie settings in production infrastructure.
9. Configure a verified Resend sender before enabling real delivery.
10. Use `PAYSTACK_VERIFICATION_MODE=live` only with valid production credentials.

The Render build script installs development dependencies, downloads MaxMind data,
and compiles the application:

```bash
npm run render-build
```

## Known Remaining Work

The backend is feature-complete for the current portfolio scope except for the durable
invitation email worker and its resend/revoke/token-link lifecycle.

Potential extensions, not requirements for the current release:

- Durable invitation email worker and resend/revoke routes.
- Token-based invite landing/acceptance endpoints.
- Ownership transfer and voluntary leave-business workflows.
- Payment execution and approval flow.
- Invoice management.
- Business audit-log read endpoints.
- Google/GitHub OAuth.
- WebSocket or server-sent-event notification delivery.

These should be added only when they serve a concrete product goal; the current code
already demonstrates the primary security, transaction, worker, and multi-tenant
patterns.

## Frontend Handoff

Frontend implementation prompts at the repository root document the expected TanStack
Query integration, permissions, routes, and response types. In particular:

```text
frontend-invites-roles-notifications.prompt.md
business-navigation.prompt.md
```

The backend returns permissions and data, not frontend navigation definitions or icon
names. Frontend route guards improve user experience, while backend middleware remains
the authorization boundary.
