# Resume Prompt: Verify Invite, Email, and Notification Work

I have been implementing the business invitation, invitation-email, and
notification workflow in this Aurex backend. First read `tobuild.md`, then examine
the repository as it currently exists.

Do not implement or edit anything initially. Do not assume that a route works just
because a file exists. Trace each route through validator, middleware, controller,
service, repository, model, module wiring, and `app.ts` registration.

Validate all of the following:

1. Protected invite routes exist under
   `/api/businesses/:businessId/invites`, use merged params, authentication,
   validation, `members:invite`, and business-scoped repository queries.
2. Token routes exist under `/api/business-invites/:token`; inspect-token exposes
   only safe data, while accept/decline require authentication and enforce invited
   email ownership.
3. Invite creation validates assignable roles, prevents privilege escalation,
   rejects existing active members and duplicate pending invites, generates a
   cryptographically random token, stores only its hash, and never logs or returns
   the raw token.
4. Acceptance rechecks token status/expiry, business, role, and authenticated email,
   then creates membership and consumes the invite atomically in a Mongo session.
   Check concurrency and duplicate-membership behavior.
5. Resend rotates the token, invalidates the old link, resets expiry, is rate
   limited, and records delivery attempts/status without exposing provider errors.
6. Revoke/decline preserve audit history and invalidate further token use.
7. `BusinessInvite` serializes `id`, never serializes `tokenHash`, supports all
   statuses used by services, and has suitable indexes for duplicate/concurrent
   requests.
8. The email service has a typed invitation method, uses `CLIENT_URL`, preserves the
   delivery override, escapes dynamic HTML, and uses generic provider errors. Check
   that raw invite tokens cannot enter logs.
9. Email failure does not silently erase an invite or produce duplicate invites.
   Confirm the API exposes a controlled delivery result and resend can recover.
10. Notification list/read routes are registered and user-scoped. Confirm
    pagination, total, unread count, JSON `id`, idempotent reads, and 404 behavior
    for another user's notification.
11. Resolve whether `auditEventId` is required: the notification TypeScript type,
    Mongoose model, and every creation path must agree.
12. Invite received/accepted/declined and membership-activated audit events and
    notifications are created for valid registered users. No notification should be
    created for an unregistered email without a user ID.
13. External email/notification failure after successful membership acceptance does
    not roll back the membership transaction.
14. Tests cover permissions, cross-business access, role escalation, duplicate and
    concurrent requests, token lifecycle, email mismatch, email failures, and
    notification ownership.

Report findings first, ordered by severity, with clickable file and line references.
Explain the concrete failure or security consequence and the smallest correct fix.
Then list which requirements are correctly implemented and which remain missing.

Do not run the full build or test suite unless I explicitly ask. You may perform
read-only repository inspection. If important intent is genuinely ambiguous, stop
and ask me instead of inventing behavior.

codex resume 019f088a-917f-7a52-974c-e2ce66c15599
