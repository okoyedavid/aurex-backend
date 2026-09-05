# GitHub Access Enforcement

## Architecture

GitHub enforcement is downstream of the existing policy engine:

```text
employee facts -> policy resolution -> effective assignment
  -> external desired-state sync -> BullMQ enforcement job
  -> GitHub read/diff/mutate/verify -> persisted result -> audit
```

The policy resolver remains pure and GitHub-independent. Existing policies
without a valid GitHub target remain informational and are not enforced.

`ExternalAccessGrant` separates the desired assignment state from the observed
GitHub state. It also records whether Aurex created the grant. Access that was
already present is not deleted when a policy stops applying. For repository
permissions that Aurex changes, the previous direct permission is retained as
a baseline and restored during revocation.

The existing policy reconciliation queue now also processes:

- Employee external desired-state synchronization.
- One idempotent enforcement job per grant and desired revision.
- Nightly verification of every Aurex-managed GitHub grant.

Retryable network, rate-limit, and GitHub 5xx failures are thrown back to
BullMQ for its existing exponential retry policy. Missing identities,
disconnected installations, invalid resources, and permission failures become
non-retrying configuration or blocked states.

## Policy configuration

Team membership:

```json
{
  "provider": "github",
  "resourceType": "team",
  "organizationId": 123456,
  "organizationLogin": "acme",
  "teamId": 98765,
  "teamSlug": "backend",
  "role": "member"
}
```

Direct repository access:

```json
{
  "provider": "github",
  "resourceType": "repository",
  "repositoryId": 456789,
  "owner": "acme",
  "repo": "api",
  "permission": "push"
}
```

Supported repository permissions are `pull`, `triage`, `push`, `maintain`, and
`admin`. Team enforcement supports only `member`.

When policy configuration is created or updated, the resource ID and name are
checked against resources visible to that business's installation. A business
cannot configure a resource from another installation.

## API

All endpoints require authentication and normal business-scoped permission
checks.

```http
GET    /api/businesses/:businessId/integrations/github
POST   /api/businesses/:businessId/integrations/github/install-url
POST   /api/businesses/:businessId/integrations/github/complete
DELETE /api/businesses/:businessId/integrations/github

GET /api/businesses/:businessId/integrations/github/repositories
GET /api/businesses/:businessId/integrations/github/teams

GET    /api/businesses/:businessId/employees/:employeeId/external-identities/github
PUT    /api/businesses/:businessId/employees/:employeeId/external-identities/github
DELETE /api/businesses/:businessId/employees/:employeeId/external-identities/github

GET /api/businesses/:businessId/employees/:employeeId/external-access
```

The identity update body is:

```json
{ "username": "demo-github-user" }
```

The completion body is:

```json
{ "installationId": 12345678, "state": "value-returned-by-github" }
```

The install URL operation creates a cryptographically random, ten-minute state
bound to the Aurex business. Completion atomically consumes that state, rejects
an installation already assigned to another business, and verifies the
installation using GitHub App authentication. The callback's `installation_id`
is never trusted by itself.

## Data models

### GitHubConnection

Stores business ID, installation ID, GitHub account metadata, repository
selection, status, connection timestamp, and a temporary hashed installation
state. Installation access tokens are never stored.

### EmployeeExternalIdentity

Stores business ID, employee ID, provider, GitHub username, immutable numeric
GitHub user ID when verified, and verification status.

### ExternalAccessGrant

Stores assignment/policy references, a snapshot of the target, desired and
actual states, desired revision, ownership/baseline information, verification
timestamps, and sanitized error information.

Actual states include `needs_configuration`, `pending_acceptance`, and
`retained_external` in addition to ordinary pending/granted/revoked/failed
states.

## Environment variables

Required for GitHub operations:

```dotenv
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY_B64=
```

`GITHUB_APP_PRIVATE_KEY` may be used instead of the base64 value. Literal
`\\n` sequences are converted to PEM newlines. Base64 is recommended for hosted
environments. Optional:

```dotenv
GITHUB_API_BASE_URL=https://api.github.com
```

`REDIS_URL` remains required for live and periodic enforcement because this
feature reuses the existing BullMQ reconciliation worker.

## GitHub App configuration

Repository permissions:

- Metadata: read-only.
- Members: read and write, for organization team membership.
- Administration: read and write, for direct collaborator management.

Organization permissions:

- Members: read and write.

Use the narrowest permissions compatible with the chosen resource types. If
only the team demo is required, do not grant repository administration.

Set the GitHub App setup URL to a frontend route that receives GitHub's
`installation_id`, `setup_action`, and returned `state`, then submits
`installationId` and `state` to the authenticated completion endpoint. Enable
"Redirect on update" only if that frontend handles update callbacks safely.

Webhooks are not required for this MVP. The nightly reconciliation scheduler is
the drift safety net.

## Manual demo steps

1. Create a GitHub App owned by the test organization.
2. Configure the permissions listed above and set the setup URL to the Aurex
   frontend completion page.
3. Generate a private key, base64-encode the complete PEM, and configure the
   three required environment variables.
4. Ensure MongoDB and Redis are running, then start the Aurex server/worker.
5. Request the install URL for the business and open it while signed into the
   GitHub organization owner account.
6. Install the App for all repositories or the repositories needed by the
   test, then have the frontend submit the returned installation ID and state.
7. Use the resource endpoints to obtain the stable organization/team or
   repository IDs.
8. Set Emeka Okoye's GitHub identity to the demo username.
9. Create an Application Access policy using the discovered target, activate
   it, and create the existing department/group/status rules.
10. Trigger or wait for policy reconciliation and inspect the employee external
    access endpoint and audit feed.
11. Move Emeka out of the qualifying department/group, reconcile again, and
    verify that Aurex-created access is removed while unrelated access remains.

## MVP limitations

- No SCIM, enterprise managed-user provisioning, or employee OAuth linking.
- No webhook lifecycle processing; installation status changes are observed
  when API calls fail and by scheduled reconciliation.
- Disconnecting Aurex removes the local installation binding but does not
  uninstall the GitHub App; uninstall it separately in GitHub when required.
- Resource discovery reads directly from GitHub and is not cached.
- A GitHub App installation for a personal account cannot expose organization
  teams.
- Installation access tokens are generated on demand; there is no shared token
  cache in this iteration.
