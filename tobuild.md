# Aurex: Remaining Work

## Current State

Completed backend work:

- Business creation, including employee lists and employees.
- Employee-list and employee creation/read routes and bank-verification worker.
- Permission-aware business context.
- Paginated business-member listing.
- Individual business-member lookup.
- Member responses populate business, user, role, and inviter data.
- `BusinessMember` and `Role` JSON responses expose `id` instead of `_id`.

The immediate priority is the invitation workflow, invitation email delivery, and
user notifications. Role CRUD and member-management mutations can follow.

## Priority 1: Business Invitations

The `BusinessInvite` model exists, but its repository, service, controller,
validators, module, routes, email integration, and tests still need to be built.

### Protected Business Invite Routes

Mount these under `/api/businesses/:businessId/invites` with
`Router({ mergeParams: true })`:

```http
GET    /api/businesses/:businessId/invites?page=1&limit=20&status=pending
POST   /api/businesses/:businessId/invites
POST   /api/businesses/:businessId/invites/:inviteId/resend
DELETE /api/businesses/:businessId/invites/:inviteId
```

Use `members:invite` for all four routes. Every repository lookup must include
`businessId`; never authorize using an `inviteId` alone.

#### Create invite

```http
POST /api/businesses/:businessId/invites
Content-Type: application/json

{
  "email": "member@example.com",
  "roleId": "MongoObjectId"
}
```

Required behavior:

1. Normalize the email with `trim().toLowerCase()`.
2. Confirm the role is assignable to this business. A system role must be an
   explicitly assignable system role; a custom role must belong to `businessId`.
3. Prevent assigning Owner or any role containing permissions the inviter cannot
   assign. Do not let `members:invite` become a privilege-escalation path.
4. Reject an email that is already an active business member with `409`.
5. Reject an existing non-expired pending invite for the same business and email
   with `409`. The caller should use resend instead.
6. Generate a cryptographically random token, store only its SHA-256 hash, and put
   the raw token only in the email URL.
7. Set an expiry, preferably seven days, and record the authenticated inviter.
8. Write the invite before sending email. Email is an external side effect and
   cannot be part of a MongoDB transaction.
9. Attempt email delivery and record delivery state. Do not delete the invite if
   delivery fails, because the provider may have accepted the email before the
   request failed. Return a clear delivery status and allow resend.
10. Never return `tokenHash` or a raw token in an API response or log.

Suggested success response:

```ts
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
type EmailDeliveryStatus = "pending" | "sent" | "failed";

type BusinessInviteResponse = {
  id: string;
  email: string;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  emailDeliveryStatus: EmailDeliveryStatus;
  lastEmailSentAt: string | null;
  emailDeliveryAttempts: number;
  role: {
    id: string;
    name: string;
    key: string;
    type: "system" | "custom";
  };
  invitedBy: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
  };
  createdAt: string;
  updatedAt: string;
};
```

Do not expose raw provider errors to clients. If a failure reason is stored, keep
it sanitized and admin-facing.

#### List invites

- Paginate with default `page=1`, `limit=20`, and maximum `limit=100`.
- Optionally filter by the validated status enum.
- Populate safe role and inviter fields.
- Return `{ items, pagination: { page, limit, total, totalPages } }`.
- Never select or serialize `tokenHash`.

#### Resend invite

- Look up by `{ _id: inviteId, businessId }`.
- Permit only pending invites. Return `409` for accepted or revoked invites.
- Rotate the token and token hash so old links immediately stop working.
- Reset the expiry window.
- Apply a dedicated email-delivery rate limiter.
- Update delivery attempts, status, and last-sent timestamp.
- Keep the invite pending if delivery fails and return a controlled result.

#### Revoke invite

- Look up by `{ _id: inviteId, businessId }`.
- Permit only pending invites; make an already-revoked request idempotent or return
  a documented `409` consistently.
- Set `status="revoked"`, `revokedAt`, and `revokedByUserId`.
- Use revoke rather than physically deleting the record so audit history remains.

### Token Routes

Mount token routes separately because a business ID is not known from the URL:

```http
GET  /api/business-invites/:token
POST /api/business-invites/:token/accept
POST /api/business-invites/:token/decline
```

`GET` may be public so the acceptance page can display limited business and role
information. It must return only safe fields and a generic invalid/expired response;
never reveal the invited email in full.

Require authentication for accept and decline. Preserve the invite URL through
login or registration on the frontend.

Acceptance rules:

1. Hash the supplied token and find a pending invite by `tokenHash`.
2. Reject missing, expired, revoked, or previously used tokens.
3. Compare the authenticated user's normalized email with the invited email.
4. Revalidate the role and business before assignment.
5. In one MongoDB transaction, create the `BusinessMember` and update the invite to
   accepted with `acceptedByUserId` and `acceptedAt`.
6. Handle an already-existing membership without creating duplicates.
7. Return the created membership/business context so the frontend can navigate to
   `/business/:businessId`.

Decline rules:

- Perform the same token, expiry, status, authentication, and email checks.
- The current model has no declined status. Add `declined`, `declinedAt`, and
  `declinedByUserId`, or intentionally use `revoked` and document that choice.
  A distinct `declined` status is clearer.
- Invalidate the token after decline.

### Invite Model Changes

Add JSON transformation and delivery bookkeeping:

```text
id instead of _id
emailDeliveryStatus: pending | sent | failed
emailDeliveryAttempts: number
lastEmailSentAt: Date | null
emailFailureReason: string | null (sanitized; never public by default)
declinedAt: Date | null
declinedByUserId: ObjectId | null
status enum includes declined
```

Consider a partial unique index allowing only one pending invite per business and
normalized email. Service checks alone are vulnerable to concurrent requests.

## Priority 2: Invitation Email

The existing email service only sends verification OTP messages. Extend it with a
typed `sendBusinessInviteEmail` method instead of placing provider calls inside the
invite service.

```ts
type SendBusinessInviteEmailPayload = {
  to: string;
  inviterName: string;
  businessName: string;
  roleName: string;
  inviteUrl: string;
  expiresAt: Date;
};
```

The email should contain the business, inviter, assigned role, expiration, and one
acceptance URL. Construct the URL from `CLIENT_URL` plus the frontend invite route.
Escape interpolated HTML values. Preserve `EMAIL_DELIVERY_OVERRIDE_TO` in
development and never log the raw invite token.

Rename provider errors such as "Failed to send verification email" to generic
email-delivery errors because the provider is now shared.

For this portfolio version synchronous delivery plus persisted delivery status and
resend is sufficient. A durable email queue/outbox can be added later; do not add a
queue merely for appearance.

## Priority 3: Notifications

The notification model, repository, and service exist, but there is no controller,
validator, module route registration, or pagination response.

Build these authenticated user-owned routes:

```http
GET   /api/me/notifications?page=1&limit=20&unreadOnly=false
PATCH /api/me/notifications/read-all
PATCH /api/me/notifications/:notificationId/read
```

Rules:

- Always scope reads and updates to `req.user.id`.
- Return `404` when a notification ID does not belong to the authenticated user.
- Make marking an already-read notification idempotent.
- Paginate the list and include `total` and `unreadCount`.
- Transform `_id` to `id` in notification JSON.
- Validate pagination, boolean query coercion, and Mongo IDs.

Resolve the existing contract mismatch: `CreateNotificationPayload.auditEventId`
is optional, but the model requires it. Prefer creating invite notifications through
the audit-event service so each notification retains an audit event. Otherwise make
both the type and model agree intentionally.

Invite notification events should include:

- Existing registered invitee: invitation received.
- Inviter: invitation accepted.
- Inviter: invitation declined.
- Invitee: membership activated after acceptance.

An unregistered invitee cannot receive an in-app notification yet; email is the
delivery channel. Do not create a notification without a user ID.

Add corresponding audit event types such as:

```text
business.invite.created
business.invite.resent
business.invite.revoked
business.invite.accepted
business.invite.declined
```

Notification or email failure after membership acceptance must not roll back the
accepted membership. Record/log the side-effect failure for retry or support.

## Later Work

### Member mutations

```http
PATCH  /api/businesses/:businessId/members/:memberId/role
PATCH  /api/businesses/:businessId/members/:memberId/status
DELETE /api/businesses/:businessId/members/:memberId
```

Implement privilege-escalation protection, owner protection, and final-owner
protection before exposing these controls.

### Role management

```http
GET    /api/businesses/:businessId/roles?page=1&limit=20
POST   /api/businesses/:businessId/roles
GET    /api/businesses/:businessId/roles/:roleId
PATCH  /api/businesses/:businessId/roles/:roleId
DELETE /api/businesses/:businessId/roles/:roleId
```

System roles are read-only. Custom roles belong to one business. Add explicit role
permissions (`roles:view`, `roles:create`, `roles:update`, `roles:delete`, and
`roles:assign`) only when this module is implemented.

## Required Tests

- Permission denial and cross-business invite access.
- Invalid role, foreign custom role, Owner assignment, and privilege escalation.
- Duplicate active member and duplicate pending invite.
- Token hash storage; raw tokens never persist or appear in responses.
- Invalid, expired, revoked, declined, and already-used tokens.
- Authenticated email mismatch during acceptance and decline.
- Transactional acceptance and concurrent double acceptance.
- Resend token rotation and rate limiting.
- Email sent, provider failure persisted, and resend recovery.
- Invite and acceptance notifications for registered users.
- Notification ownership, pagination, unread count, read one, and read all.
