# Frontend Sessions Implementation Prompt

Use this prompt in the frontend project to wire the existing dummy UI at `dashboard/settings#sessions` to the backend session routes with TanStack Query.

## Backend Routes

The session router is mounted at `/api`.

Use these endpoints:

- `GET /api/me/sessions`
- `DELETE /api/me/sessions/:userSessionId`
- `DELETE /api/me/sessions`

All requests must include cookies:

```ts
fetch(url, {
  credentials: "include",
});
```

## Types

Use the existing frontend shared type file, currently `generic.ts`, for the base `UserSession`, `ApiErrorResponse`, and ID/date aliases. If the exact session API types are not already present, add these frontend-only types:

```ts
export type SessionListItem = UserSession & {
  isCurrentSession: boolean;
  isCurrentIpMatch: boolean;
};

export type GetMySessionsResponse = {
  message: "session retrieved successfully";
  currentIpAddress: string | null;
  data: SessionListItem[];
  sessions: SessionListItem[];
};

export type RevokeSessionResponse = {
  message: "Session revoked successfully";
  revokedCurrentSession: boolean;
  userSession: UserSession | null;
};

export type RevokeOtherSessionsResponse = {
  message: "Other sessions revoked successfully";
  revokedCount: number;
};

export type SessionRouteErrorResponse = {
  message: string;
  requestId?: string | null;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  stack?: string;
};
```

Use `userSessionId` as the identifier for revoke calls:

```ts
DELETE /api/me/sessions/${session.userSessionId}
```

## Required UI Behavior

Implement the real sessions experience inside the existing settings sessions section.

Display:

- device name, or fallback to `Unknown device`
- location from `city`, `region`, `country`
- IP address
- last seen date
- created date
- current session badge when `isCurrentSession` is true
- revoked/inactive indication when `revokedAt` is not null

Actions:

- Revoke a single session.
- Revoke all other sessions.
- Disable revoke buttons while the relevant mutation is pending.
- Do not allow “revoke all other sessions” to appear destructive to the current session; backend keeps current session active.

## TanStack Query Requirements

Create session query keys such as:

```ts
export const sessionKeys = {
  all: ["sessions"] as const,
  me: () => [...sessionKeys.all, "me"] as const,
};
```

Create hooks:

```ts
useMySessionsQuery()
useRevokeSessionMutation()
useRevokeOtherSessionsMutation()
```

Use `useQuery` for `GET /api/me/sessions`.

Use `useMutation` for both delete actions.

After a normal revoke succeeds:

- invalidate `sessionKeys.me()`
- show the backend success message

After `DELETE /api/me/sessions/:userSessionId` succeeds and `revokedCurrentSession === true`:

- clear frontend auth/user state
- remove or invalidate auth-related queries such as current user/me
- treat the user as logged out because the backend clears auth cookies
- redirect according to the app’s requested behavior: navigate to `/dashboard`

If `/dashboard` is protected in the current frontend app, use the app’s existing unauthenticated redirect behavior after navigation.

After `DELETE /api/me/sessions` succeeds:

- invalidate `sessionKeys.me()`
- show `revokedCount`
- keep the user logged in

## API Client Behavior

Build a small typed client:

```ts
async function getMySessions(): Promise<GetMySessionsResponse>
async function revokeSession(userSessionId: string): Promise<RevokeSessionResponse>
async function revokeOtherSessions(): Promise<RevokeOtherSessionsResponse>
```

For failures:

- parse JSON as `SessionRouteErrorResponse`
- throw an `Error` that preserves the message and status
- show `error.message` in the UI
- handle `401` by clearing auth state and redirecting through the existing unauthenticated flow
- handle `404` for a single session revoke by showing “Session not found” and refreshing the session list
- handle `429` with a rate-limit friendly message

## UX Notes

Use the existing dashboard/settings UI patterns. Do not create a new standalone sessions page if the dashboard already has a settings sessions panel.

Use confirmation UI before revoking a session. The current session confirmation should be stronger because it logs the user out.

Suggested confirmation copy:

```txt
This is your current session. Revoking it will log you out on this device.
```

For all other sessions:

```txt
This will sign out your account on every other device.
```

Do not fake session data once the API is connected. Show loading, empty, and error states from TanStack Query.
