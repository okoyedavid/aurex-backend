# Frontend Implementation Prompt: GitHub Access Enforcement

Extend the Aurex frontend with complete GitHub access-enforcement management.

This is a frontend integration for an already implemented backend capability.
Do not redesign the policy engine, create a second GitHub-specific policy
system, or perform GitHub API calls directly from the browser. The frontend
configures and presents the backend workflow:

```text
Employee facts
  -> existing Aurex policy resolution
  -> effective application-access assignment
  -> backend external-access reconciliation
  -> GitHub grant/revoke/verification
  -> enforcement state and audit activity
```

The backend contract and operational details are documented in:

```text
docs/github-access-enforcement.md
docs/audit-api.md
docs/audit-api-historical-policy-snapshots.patch.md
```

Read those documents before implementation.

## Required discovery before coding

Inspect the complete existing frontend and report briefly:

1. Routing and page-layout conventions.
2. API client, query, mutation, cache-key, and error-handling patterns.
3. Authentication and active-business selection.
4. Permission and role checks.
5. Existing policy category, policy, rule, employee, employee-detail, settings,
   activity/audit, dialog, form, toast, table, badge, skeleton, and empty-state
   components.
6. Existing TypeScript API types and response-envelope conventions.
7. Existing test setup and mocking conventions.
8. Files that will be modified and components/hooks/types that will be added.

Then implement the complete frontend vertical slice. Do not stop after a plan
or static scaffolding.

## Product goals

An authorized business administrator must be able to:

1. See whether GitHub is connected.
2. Start the GitHub App installation flow.
3. Safely complete the installation after GitHub redirects back.
4. See the connected GitHub account and installation state.
5. Disconnect GitHub from Aurex.
6. Discover teams and repositories available through the installation.
7. Map an Aurex employee to an explicit GitHub username.
8. Configure an existing Aurex policy with either a GitHub team or repository
   target.
9. See the desired and actual enforcement state for an employee.
10. Understand missing configuration, invitations, drift, failures, and access
    retained through another source.
11. Read accurate business-language audit events without confusing the
    employee subject with the policy.

The primary demo path is GitHub organization team membership. Direct repository
collaborator access must also be configurable and observable.

## Non-goals

Do not implement:

- Direct browser-to-GitHub API calls.
- Personal access-token entry.
- Storage or display of GitHub App private keys or installation tokens.
- Employee GitHub OAuth linking.
- GitHub billing or marketplace UI.
- Slack, Google Workspace, SCIM, or a generalized integration marketplace.
- A second policy builder specifically for GitHub.
- Client-side grant or revoke buttons that bypass policy reconciliation.
- Claims that an invitation is already accepted.
- Claims that effective repository access is gone merely because a direct
  collaborator grant was removed.

## Backend response convention

Successful Aurex responses use this envelope:

```ts
type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};
```

Errors provide a safe `message` and may provide `requestId`. Reuse the existing
frontend error normalizer. Do not show raw response dumps, stack traces, GitHub
payloads, resource IDs, or backend event codes as primary UI copy.

## Permissions

The backend defines:

```text
integrations:view
integrations:manage
employees:view
employees:update
policies:view
policies:create
policies:update
policies:reconcile
audit_logs:view
policies:view_audit
```

Follow the frontend's existing effective-permission logic, including explicit
denials if supported.

- `integrations:view`: view connection and discover resources.
- `integrations:manage`: start installation, complete installation, disconnect.
- `employees:view`: read an employee's GitHub identity.
- `employees:update`: set or remove an employee's GitHub identity.
- Existing policy permissions continue to control policy configuration.
- Existing audit permissions continue to control organization audit access.

Do not merely hide forbidden actions. Disabled actions should explain the
missing permission when that matches existing Aurex UX. The backend remains the
authority and 403 responses must still be handled.

## API contracts

Use the existing API base URL, credentials/cookie behavior, query library, and
request abstraction. Do not create a parallel HTTP client.

### Read GitHub connection

```http
GET /api/businesses/:businessId/integrations/github
```

Disconnected businesses may return a minimal object:

```ts
type DisconnectedGitHubConnection = {
  provider: "github";
  status: "disconnected";
};
```

Connected records conceptually contain:

```ts
type GitHubConnection = {
  id: string;
  businessId: string;
  installationId: number | null;
  accountId: number | null;
  accountLogin: string | null;
  accountType: "Organization" | "User" | null;
  status: "active" | "suspended" | "disconnected";
  repositorySelection: "all" | "selected" | null;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Never expect a private key, access token, pending state hash, or state expiry in
this response.

### Create installation URL

```http
POST /api/businesses/:businessId/integrations/github/install-url
Content-Type: application/json

{}
```

Response data:

```ts
type GitHubInstallUrl = {
  url: string;
  expiresAt: string;
};
```

Open the returned URL in the current window unless existing frontend behavior
has a well-tested popup flow. Preserve enough local route state to return the
user to the GitHub integration screen.

Do not generate the GitHub URL in the frontend. Do not generate or alter the
security `state` value.

### Complete installation

GitHub redirects to the configured frontend setup page with query parameters
including `installation_id`, `setup_action`, and `state`.

The frontend setup page must:

1. Require an authenticated Aurex user and active business context.
2. Read `installation_id` and `state` exactly once.
3. Validate only their basic shape client-side.
4. Send them to the backend for authoritative verification.
5. Never treat the query parameter alone as proof of installation ownership.
6. Remove sensitive/transient callback query parameters from browser history
   after processing, using the router's replace operation.
7. Be safe against React Strict Mode or route remounts causing duplicate
   completion requests. Use a stable mutation guard/idempotent effect pattern.

```http
POST /api/businesses/:businessId/integrations/github/complete
Content-Type: application/json

{
  "installationId": 12345678,
  "state": "opaque-state-returned-by-github"
}
```

The backend atomically consumes the one-time state, verifies the installation
with GitHub App authentication, and rejects expired, reused, spoofed, or
cross-business installations.

Handle these callback outcomes deliberately:

- `setup_action=install`: complete normally.
- `setup_action=update`: refresh connection status; complete only if valid
  installation and state values are present.
- User cancelled or required parameters missing: show a recoverable cancelled
  state and a button to start again.
- Expired or already-used state: explain that the connection attempt expired
  and provide “Try again.”
- Installation belongs to another Aurex business: show a conflict message; do
  not retry automatically.
- Suspended installation: show connection as suspended and block resource
  configuration until corrected in GitHub.

After success, invalidate/refetch connection, repository, team, policy, and
relevant external-access queries.

### Disconnect

```http
DELETE /api/businesses/:businessId/integrations/github
```

Require a confirmation dialog. Explain:

- Aurex will stop being able to reconcile GitHub access.
- Existing desired assignments remain in Aurex.
- Enforcement states can become `needs_configuration`.
- This does not uninstall the GitHub App from GitHub.
- The user must uninstall the App separately in GitHub if desired.

Do not imply that disconnecting automatically revokes every GitHub permission.

### List repositories

```http
GET /api/businesses/:businessId/integrations/github/repositories
```

Response data:

```ts
type GitHubRepository = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
};

type GitHubRepositoryList = {
  items: GitHubRepository[];
};
```

### List teams

```http
GET /api/businesses/:businessId/integrations/github/teams
```

Response data:

```ts
type GitHubTeam = {
  id: number;
  slug: string;
  name: string;
  organizationId: number;
  organizationLogin: string;
};

type GitHubTeamList = {
  items: GitHubTeam[];
};
```

Only request resources when the connection is `active`. Use the existing query
library's conditional/enabled-query mechanism. Do not repeatedly refetch large
lists while a select popover is closed.

### Read employee GitHub identity

```http
GET /api/businesses/:businessId/employees/:employeeId/external-identities/github
```

The data may be `null`.

```ts
type EmployeeGitHubIdentity = {
  id: string;
  businessId: string;
  employeeId: string;
  provider: "github";
  externalId: number | null;
  username: string;
  verificationStatus: "unverified" | "verified";
  createdAt: string;
  updatedAt: string;
};
```

### Set employee GitHub identity

```http
PUT /api/businesses/:businessId/employees/:employeeId/external-identities/github
Content-Type: application/json

{ "username": "demo-github-user" }
```

Client validation should trim whitespace and accept valid GitHub usernames:
alphanumeric characters and single hyphens internally, maximum 39 characters,
with no leading or trailing hyphen.

If GitHub is connected, the backend resolves the username and stores GitHub's
immutable numeric user ID with `verificationStatus: "verified"`. If GitHub is
not connected, an administrator can still store the username as `unverified`.

Do not infer a username from employee email or account username.

### Remove employee GitHub identity

```http
DELETE /api/businesses/:businessId/employees/:employeeId/external-identities/github
```

Require confirmation if the employee has desired GitHub grants. Explain that
enforcement will move to `needs_configuration`; do not imply immediate access
revocation when Aurex cannot identify the GitHub account.

### Read employee external-access state

```http
GET /api/businesses/:businessId/employees/:employeeId/external-access
```

Response data:

```ts
type ExternalAccessActualState =
  | "unknown"
  | "pending"
  | "granted"
  | "revoked"
  | "drifted"
  | "blocked"
  | "needs_configuration"
  | "failed"
  | "pending_acceptance"
  | "retained_external";

type ExternalAccessGrant = {
  id: string;
  businessId: string;
  employeeId: string;
  assignmentId: string;
  policyId: string;
  policyVersion: number;
  assignmentSource: "rule" | "manual";
  provider: "github";
  resourceType: "team" | "repository";
  resourceExternalId: string;
  resourceDisplayName: string;
  target: GitHubTeamTarget | GitHubRepositoryTarget;
  desiredState: "granted" | "revoked";
  desiredRevision: number;
  actualState: ExternalAccessActualState;
  managedByAurex: true;
  managedGrantCreated: boolean;
  baselinePermission: string | null;
  lastAttemptAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Treat fields not needed by normal users as diagnostic details. Do not display
`resourceExternalId`, `desiredRevision`, or error codes as the primary label.

## Policy target types

Use these exact discriminated unions in the frontend API layer:

```ts
type GitHubTeamTarget = {
  provider: "github";
  resourceType: "team";
  organizationId: number;
  organizationLogin: string;
  teamId: number;
  teamSlug: string;
  role: "member";
};

type GitHubRepositoryPermission =
  | "pull"
  | "triage"
  | "push"
  | "maintain"
  | "admin";

type GitHubRepositoryTarget = {
  provider: "github";
  resourceType: "repository";
  repositoryId: number;
  owner: string;
  repo: string;
  permission: GitHubRepositoryPermission;
};
```

The backend stores this object in the existing policy `configuration` field.
Do not add a separate GitHub-policy endpoint or frontend-only policy record.

## Required UI surfaces

### 1. Integrations settings page

Add GitHub to the existing business settings/integrations area. If no
integrations area exists, create a focused business settings page that follows
existing navigation and page-shell conventions. Do not create a marketplace.

Connection card content:

- GitHub icon using the existing icon library.
- Name: `GitHub`.
- Description: `Automatically manage organization team and repository access
  from Aurex application-access policies.`
- Status badge: Connected, Suspended, Disconnected, or Loading.
- Connected account login and type.
- Repository selection: All repositories or Selected repositories.
- Connected date where available.
- Primary action: Connect GitHub or Reconnect GitHub.
- Secondary action when active: Manage installation, if a safe GitHub URL is
  already available through existing configuration; otherwise omit it.
- Destructive action: Disconnect.

States:

- Loading skeleton: preserve card dimensions.
- Disconnected: explain that existing policies remain informational until a
  target is configured and GitHub is connected.
- Suspended: warning treatment and instructions to unsuspend in GitHub.
- Active: positive but restrained connected state.
- Error: inline retry without erasing known connection data.
- Missing permission: read-only presentation or existing permission-denied UI.

### 2. GitHub installation callback page

Add a dedicated callback route under the existing authenticated app shell or a
minimal authenticated completion shell, depending on routing conventions.

Render explicit stages:

```text
Connecting GitHub...
GitHub connected
Connection cancelled
Connection expired
Connection failed
```

On success, replace the callback URL to remove query parameters and navigate to
the integration settings page. Preserve a visible success confirmation/toast.

Never log the callback URL or state.

### 3. Employee GitHub identity

Add a GitHub section to the existing employee detail/edit experience.

Read state:

- GitHub username with `@` presentation.
- Verified or Unverified badge.
- GitHub numeric ID may appear only in a subdued diagnostic/details view.
- Link to `https://github.com/{encodedUsername}` may open in a new tab with
  `noopener noreferrer`.
- Edit and Remove actions based on `employees:update`.

Edit state:

- One username field, not email.
- Explain: `Aurex uses this identity when enforcing GitHub access policies.`
- Explain that this does not give Aurex the employee's password.
- Show validation and server errors inline.
- Invalidate identity and external-access queries after mutation.

Empty state:

- `No GitHub identity configured.`
- If enforceable GitHub access is desired, explain that reconciliation will
  show `Needs configuration` until a username is set.

### 4. Existing policy create/edit form

Extend the existing policy form. Do not replace the policy category, effective
date, rule, priority, cardinality, activation, or assignment UX.

Add an optional `External enforcement` or `Application resource` section to
the policy's existing `configuration` editor.

Suggested form progression:

1. Enforcement provider:
   - `Informational only`
   - `GitHub`
2. If GitHub is selected, require an active connection.
3. Resource type:
   - Organization team — recommended/default.
   - Repository collaborator.
4. Team selector or repository selector.
5. Repository permission selector when repository is selected.

Team selection must submit both stable IDs and display identifiers from the
selected server result:

```ts
configuration = {
  provider: "github",
  resourceType: "team",
  organizationId: selected.organizationId,
  organizationLogin: selected.organizationLogin,
  teamId: selected.id,
  teamSlug: selected.slug,
  role: "member",
};
```

Repository selection:

```ts
configuration = {
  provider: "github",
  resourceType: "repository",
  repositoryId: selected.id,
  owner: selected.owner,
  repo: selected.name,
  permission,
};
```

Use stable numeric IDs; do not construct configuration from text input alone.

Resource selector requirements:

- Search/filter client-side across returned resources.
- Display team name and slug.
- Display repository full name and private/public badge.
- Keyboard accessible selection.
- Loading, empty, and retry states.
- An empty repository list should mention the App's repository selection.
- A personal-account installation should explain that teams require an
  organization installation.
- Do not fetch resources when GitHub is disconnected.

Changing or removing an existing GitHub target can cause access revocation.
Show a concise warning before saving:

`Changing this target will cause Aurex to reconcile the old and new GitHub
access after the policy update.`

Do not add manual grant/revoke controls to this form.

### 5. Policy detail presentation

For a GitHub-enforced policy, show:

- Provider: GitHub.
- Resource type: Team or Repository.
- Resource display name.
- Organization/repository name.
- Role or repository permission.
- Policy status and effective dates using existing UI.
- A clear distinction between policy assignment and successful enforcement.

Example:

```text
External enforcement
GitHub team · acme/backend
Role: Member
```

For policies without GitHub configuration, show the existing behavior and do
not add noisy “unenforced” warnings everywhere.

### 6. Employee external-access panel

Add an `Application access` or `External access` panel to employee details,
using the existing information architecture.

Each grant row/card must show:

- GitHub provider.
- Policy name if available from the existing assignment/policy cache; otherwise
  a neutral `Policy` label without guessing.
- Team or repository display name.
- Desired state.
- Actual state.
- Last verified time.
- Assignment source: Automatic or Manual.
- Safe error message when present.

Use a deliberate state presentation:

| Actual state | Label | Meaning/action |
|---|---|---|
| `unknown` | Not checked | Waiting for first reconciliation. |
| `pending` | Reconciling | Worker execution is in progress or queued. |
| `granted` | Granted | GitHub verification confirmed desired access. |
| `revoked` | Removed | Aurex-managed access was removed and verified. |
| `drifted` | Drift detected | Actual GitHub state differed; reconciliation should correct it. |
| `needs_configuration` | Needs configuration | Connect GitHub, map an identity, or repair target configuration. |
| `blocked` | Action required | GitHub rejected the change, permissions are insufficient, or the team may be IdP-managed. |
| `failed` | Retry scheduled | A transient execution or verification failure occurred. |
| `pending_acceptance` | Invitation pending | Do not display as granted; the GitHub user must accept. |
| `retained_external` | Access remains through another source | Aurex removed/stopped managing its grant without claiming all effective access is gone. |

Suggested visual severity:

- Success: `granted`, `revoked` when desired is revoked.
- Neutral/progress: `unknown`, `pending`.
- Warning: `pending_acceptance`, `retained_external`, `drifted`.
- Attention/error: `needs_configuration`, `blocked`, `failed`.

Do not use red for `retained_external`; it is an important safety outcome, not
necessarily an execution failure.

Offer contextual actions only when valid:

- Missing identity -> `Configure GitHub identity`.
- Disconnected integration -> `Open GitHub integration settings`.
- Failed/pending -> explain that the backend retries automatically.
- If an existing policy reconciliation action is available and the user has
  `policies:reconcile`, it may be offered as `Reconcile policies`; do not invent
  a direct GitHub mutation endpoint.

### 7. Audit/activity timeline

The frontend must preserve these semantics:

- Actor: who initiated or executed the action.
- Subject: the employee affected.
- Policy: the policy being assigned/enforced.
- Category: the policy category.

Never interpret `subject` as a policy.

Policy audit events can include:

```ts
type AuditPolicyReference = {
  id: string;
  version: number | null;
  displayName: string;
  description: string | null;
};

type AuditCategoryReference = {
  id: string;
  displayName: string;
  description: string | null;
  cardinality: "ONE" | "MANY" | null;
};

type PolicyAuditItem = {
  actor: { type: string; displayName: string } | null;
  subject: { type: "employee" | "policy"; id?: string; displayName: string };
  policy: AuditPolicyReference | null;
  category: AuditCategoryReference | null;
  historicalSnapshotAvailable: boolean;
  summary: string;
};
```

Use `summary` as the authoritative primary sentence. Do not synthesize text like
`${subject.displayName} was assigned to this employee`.

GitHub activity summaries already use business language, for example:

- `Emeka Okoye was added to the backend GitHub team.`
- `Emeka Okoye was removed from the backend GitHub team because the policy no longer applied.`
- `GitHub access is awaiting Emeka Okoye's invitation acceptance.`
- `Aurex stopped managing Emeka Okoye's access to acme/api, but GitHub access remains through another source.`

Render the supplied summary. Structured event codes may be used for icon and
color selection, not primary copy.

If `historicalSnapshotAvailable` is false, do not imply that the current policy
or category name is guaranteed to be the historical name. A subtle legacy
indicator or tooltip is acceptable if the existing audit UI supports it.

## Query and cache behavior

Follow existing query-key conventions and include `businessId` in every
business-scoped key.

Conceptual keys:

```ts
["business", businessId, "integrations", "github"]
["business", businessId, "integrations", "github", "repositories"]
["business", businessId, "integrations", "github", "teams"]
["business", businessId, "employees", employeeId, "github-identity"]
["business", businessId, "employees", employeeId, "external-access"]
```

Never allow cached resources or identities from one business to appear in
another business after switching active business.

Mutation invalidation:

- Connection complete/disconnect: invalidate connection, resources, relevant
  policy configuration queries, and external-access state.
- Identity set/remove: invalidate identity, employee detail if embedded, audit,
  and employee external-access state.
- Policy target update: invalidate policy, assignments/explanation, audit, and
  employee external-access queries according to existing broad-invalidation
  conventions.

Do not aggressively poll GitHub resource lists. External-access state may use
the app's existing modest refetch/polling behavior while a state is `pending`,
but stop polling when it reaches a stable or action-required state.

## Accessibility and UX requirements

- Every control must have a programmatic label.
- Dialog focus must be trapped and restored.
- Status must not be communicated by color alone.
- Loading controls must prevent duplicate mutations.
- Callback progress and mutation results should use appropriate live regions if
  that convention exists.
- Preserve keyboard navigation in resource comboboxes.
- Use existing responsive page and table/card patterns.
- Use confirmation dialogs for disconnect and identity removal.
- Prefer concise business language over backend terminology.
- Never show a success toast for a merely queued grant as though GitHub already
  verified it. Say `Policy saved. GitHub reconciliation has been queued.` when
  appropriate.

## Error handling

Map safe backend messages into contextual UI. At minimum handle:

- 400: invalid callback, username, target, or form input.
- 401: existing session-expiration behavior.
- 403: missing Aurex business permission.
- 404: employee, identity, or resource no longer exists.
- 409: GitHub disconnected, installation conflict, or incompatible account.
- 422: GitHub permission/resource/configuration problem.
- 503: GitHub or reconciliation infrastructure temporarily unavailable.

Do not automatically retry non-idempotent installation completion in a loop.
Normal query-library retry behavior should be disabled for 4xx configuration
errors and bounded for transient failures.

Never surface raw GitHub HTML/error bodies or stack traces.

## Tests

Use the existing frontend test stack. Mock the Aurex backend, not GitHub.

Add tests for at least:

### Connection

- Disconnected card renders Connect action.
- Active connection renders account metadata.
- Suspended connection renders warning state.
- User without `integrations:manage` cannot mutate connection.
- Install URL comes from the backend and is opened unchanged.
- Callback submits installation ID and state once.
- Strict Mode/remount does not duplicate completion.
- Missing/cancelled callback parameters are recoverable.
- Expired state and cross-business conflict are presented safely.
- Disconnect confirmation explains that GitHub App uninstall is separate.
- Secret/token/state-hash fields are never rendered or stored in app state.

### Resource selection

- Teams are requested only for an active organization connection.
- Repositories render stable full names and visibility.
- Selected team submits all required ID/login/slug fields.
- Selected repository submits ID/owner/repo/permission.
- Team maintainer cannot be selected.
- Unsupported repository permission cannot be submitted.
- Empty, loading, and error states render correctly.
- Switching businesses cannot reuse the prior business's cached resources.

### Employee identity

- Empty identity state.
- Verified and unverified states.
- Set/update username.
- Remove identity with confirmation.
- Invalid username is rejected before request.
- Missing identity links enforcement state to configuration action.
- Requests always include both business ID and employee ID.

### External access

- Desired grant plus actual granted.
- Desired grant plus pending invitation is not shown as granted.
- Desired revoke plus revoked.
- `retained_external` explains access through another source.
- `needs_configuration`, `blocked`, `failed`, and `drifted` states.
- Safe timestamps and retry messaging.
- No direct grant/revoke HTTP mutation is introduced.

### Audit

- Uses backend `summary` as authoritative.
- Employee is rendered from `subject`.
- Policy is rendered from `policy`, never inferred from `subject`.
- Historical snapshot policy/category names are preserved.
- Legacy `historicalSnapshotAvailable: false` does not claim historical certainty.

### Regression

- Existing non-GitHub policy create/edit flows remain unchanged.
- Existing informational application-access policies remain valid.
- Existing policy cardinality, priority, rules, effective dates, manual
  assignments, explanations, and audit timeline continue working.

## Demo acceptance test

The frontend implementation is complete only when this user journey is
possible:

1. An authorized administrator opens Business Settings -> Integrations.
2. They select Connect GitHub.
3. Aurex requests a backend-generated installation URL and navigates to it.
4. GitHub redirects to the Aurex callback page.
5. The callback page completes backend verification exactly once.
6. The integration page shows the connected organization.
7. The administrator opens Emeka Okoye's employee profile.
8. They map Emeka to `@demo-github-user` and see Verified.
9. They create or edit `Backend GitHub Access` in the existing policy flow.
10. They select GitHub -> Organization team -> Backend.
11. The configuration stores the discovered team ID, organization ID/login,
    team slug, and role `member`.
12. They create existing policy rules:
    - Department equals Engineering.
    - Group contains Backend.
    - Employee status equals Active.
13. They activate/reconcile the policy using existing UX.
14. The employee external-access panel initially shows Pending/Reconciling.
15. After backend verification, it shows Granted.
16. The audit timeline shows `Emeka Okoye was added to the Backend GitHub team.`
17. The administrator changes Emeka's department to Finance.
18. Existing policy reconciliation determines that the policy no longer applies.
19. External access progresses from Pending to Removed, or to Access remains
    through another source when GitHub reports other effective access.
20. The audit timeline shows the backend-provided removal/retention summary.
21. No manual GitHub grant or revoke button is used during steps 13-20.

## Implementation constraints

- Preserve the existing component system and visual language.
- Keep route/page components thin.
- Put API calls in the existing API/service layer.
- Put server-state orchestration in existing hooks/query modules.
- Use discriminated TypeScript unions for targets and access states.
- Avoid `any` unless an existing unavoidable boundary requires it.
- Do not hardcode a business ID, GitHub organization, repository, team, or user.
- Do not add a GitHub SDK to the browser.
- Do not expose environment secrets through frontend-prefixed variables.
- Do not implement optimistic `granted` states. GitHub verification is the
  backend's responsibility.
- Preserve backward compatibility for all non-GitHub policies.

## Final output

After implementation, report:

1. Architecture followed.
2. Pages/components/hooks/types created.
3. Existing files modified.
4. Routes added.
5. API operations integrated.
6. Permission behavior.
7. Cache invalidation and callback idempotency strategy.
8. Tests added.
9. Commands run and results for tests, typecheck, lint, and production build.
10. Remaining limitations.
11. Exact frontend callback URL that must be configured as the GitHub App setup
    URL.

Do not stop after scaffolding. Implement the complete frontend workflow and run
all relevant verification commands.
