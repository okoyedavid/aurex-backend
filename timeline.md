1. Model states
   Add verification job status, timestamps, failure reason, verification mode, attempt count and optional next retry
   date.

2. Permissions
   Extend allowedPermissions, update system roles and create a reusable business-permission guard.

3. Paystack normalization
   Preserve resolved data for the frontend while exposing normalized internal outcomes: verified, invalid, or
   retryable_error.

4. Protect resolution
   Add authentication, business authorization and rate limiting. Eventually, normal bulk resolution should only be
   invoked by the queue worker.

5. Creation services
   Make business creation accept an optional employee list, and employee-list creation accept an optional employee array.
   Use one MongoDB transaction.

6. Queue integration
   Enqueue only after the transaction commits. Deduplicate jobs by employee ID and restrict worker concurrency.

7. Worker
   Process employees independently, retry temporary failures and persist every result in MongoDB.

8. List progress
   Return counts for pending, processing, verified, failed and retrying, plus an aggregate list status.

9. Polling
   Poll every 2–5 seconds and stop when no unfinished jobs remain. Avoid polling every employee individually.

10. Revalidation
    Mark verification stale whenever account number or bank code changes, then provide permission-protected retry/
    revalidate actions.

Also derive createdByUserId from authentication, never from the request body. Redis should manage queue execution, while
MongoDB stores all permanent statuses and failure reasons.
