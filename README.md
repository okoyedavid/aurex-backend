# Aurex Backend

Express + TypeScript backend for Aurex. The current codebase provides authentication, session persistence, email OTP issuing, health/status reporting, request hardening middleware, audit-event logging, notifications, and application-error capture.

## Current Capabilities

- User registration with password hashing.
- Login with access and refresh JWT creation.
- Persistent user/auth session records in MongoDB.
- Email verification OTP issuing through the verification service.
- Email verification, resend, and change-email OTP flows.
- Refresh-token rotation and logout.
- Logged-in session listing and session revocation.
- Resend-compatible email delivery with a development console fallback.
- Health JSON endpoint and HTML status page.
- Request validation with Zod.
- Global rate limiting with audit logging for blocked requests.
- Request context capture, including request id, IP, user agent, device name, and optional GeoIP location.
- Security middleware: Helmet, CORS, cookie parsing, JSON body limits, and Mongo query sanitization.
- Security audit-event persistence and optional user notifications.
- Application-error persistence for server errors.
- Business, role, member, and invite models for later business workspace features.

## Implemented HTTP Routes

Base app:

```txt
GET /
```

Health:

```txt
GET /api/health
GET /status
```

Auth:

```txt
GET /api/auth/me
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/verify-email
POST /api/auth/resend-email
POST /api/auth/change-email
PATCH /api/auth/change-email
```

Sessions:

```txt
GET /api/me/sessions
DELETE /api/me/sessions
DELETE /api/me/sessions/:userSessionId
```

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "Password123"
}
```

Password rules:

- 8 to 72 characters
- at least one uppercase letter
- at least one lowercase letter
- at least one number

Registration creates the user, issues a verification OTP, stores only the OTP hash, and sends/logs the OTP through the email service. Registration does not log the user in. The frontend should redirect to email verification and then to login after successful verification.

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "ada@example.com",
  "password": "Password123"
}
```

Login creates a user session and auth session, returns the safe user payload, and sets auth cookies.

Successful response:

```json
{
  "message": "Login successful",
  "user": {
    "id": "user-id",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "emailVerifiedAt": null,
    "status": "active",
    "createdAt": "2026-06-21T00:00:00.000Z",
    "updatedAt": "2026-06-21T00:00:00.000Z"
  }
}
```

### Verify Email

```http
POST /api/auth/verify-email
Content-Type: application/json
```

```json
{
  "email": "ada@example.com",
  "otp": "123456"
}
```

The OTP must be exactly 6 numeric characters. Verification returns the verified user but does not create an authenticated session.

### Resend Verification Email

```http
POST /api/auth/resend-email
Content-Type: application/json
```

```json
{
  "email": "ada@example.com"
}
```

Successful response:

```json
{
  "message": "Email sent successfully!"
}
```

### Refresh

```http
POST /api/auth/refresh
```

Refresh reads the `refreshToken` cookie, rotates the auth session, sets new auth cookies, and returns the updated user session.

### Logout

```http
POST /api/auth/logout
```

Logout reads the `refreshToken` cookie, revokes the matching user session, records an audit event, and clears auth cookies.

### Current User

```http
GET /api/auth/me
```

Requires auth cookies. Returns the current logged-in user.

### Change Email

```http
POST /api/auth/change-email
PATCH /api/auth/change-email
```

`POST` sends an OTP to the new email address. `PATCH` verifies the OTP and updates the user email. Both routes require authentication.

### Session Management

```http
GET /api/me/sessions
```

Returns the current user's sessions with frontend-friendly flags:

```json
{
  "message": "session retrieved successfully",
  "currentIpAddress": "127.0.0.1",
  "data": [
    {
      "id": "user-session-id",
      "userSessionId": "user-session-id",
      "deviceName": "Chrome on Windows",
      "ipAddress": "127.0.0.1",
      "lastSeenAt": "2026-06-21T00:00:00.000Z",
      "createdAt": "2026-06-21T00:00:00.000Z",
      "expiresAt": "2026-06-28T00:00:00.000Z",
      "revokedAt": null,
      "isCurrentSession": true,
      "isCurrentIpMatch": true
    }
  ],
  "sessions": []
}
```

```http
DELETE /api/me/sessions/:userSessionId
```

Revokes one session owned by the current user. If the revoked session is the current session, auth cookies are cleared and the response includes `revokedCurrentSession: true`.

```json
{
  "message": "Session revoked successfully",
  "revokedCurrentSession": true,
  "userSession": {
    "userSessionId": "user-session-id",
    "revokedAt": "2026-06-21T00:00:00.000Z"
  }
}
```

```http
DELETE /api/me/sessions
```

Revokes all other sessions for the current user and leaves the current session active.

```json
{
  "message": "Other sessions revoked successfully",
  "revokedCount": 2
}
```

### Error Shape

Most failed requests return:

```json
{
  "message": "Validation failed",
  "requestId": "request-id",
  "details": {
    "formErrors": [],
    "fieldErrors": {}
  }
}
```

Server errors include the real message outside production. In production, server errors return `"Internal server error"`.

## Environment Variables

Create a `.env` file:

```env
NODE_ENV=development
PORT=5000

MONGO_URI=mongodb://user:password@host1:27017,host2:27017,host3:27017/aurex?ssl=true&replicaSet=your-replica-set&authSource=admin&appName=aurex

JWT_ACCESS_SECRET=replace-with-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-at-least-32-characters
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

CLIENT_URL=http://localhost:3000
RELEASE=local
MAXMIND_DB_PATH=src/data/GeoLite2-City.mmdb

APP_NAME=Aurex
RESEND_API_KEY=
EMAIL_FROM=
```

Important MongoDB note: the database name is the path before `?`, for example `/aurex`. `appName=aurex` does not choose the database.

For local development, if `RESEND_API_KEY` or `EMAIL_FROM` is missing, OTP emails are logged to the console instead of being sent. In production, missing email configuration throws an error.

## Scripts

```bash
npm run dev
```

Runs the TypeScript server with `tsx watch`.

```bash
npm run build
```

Compiles `src/` into `dist/`.

```bash
npm start
```

Runs the compiled app from `dist/server.js`.

```bash
npm test
```

Runs Vitest with `NODE_ENV=test`.

## Testing

The project is set up for Vitest. Current test coverage includes a verification service test showing the preferred dependency-injection testing pattern:

```txt
tests/verification.service.test.ts
```

The test creates a service instance from `createVerificationService` with fake dependencies, so runtime module wiring does not need to be changed.

Recommended testing split:

- Service/unit tests: test service factories directly with fake repositories/services.
- Route/integration tests: use Supertest against `app` from `src/app.ts`.
- Database tests: use a separate MongoDB database such as `aurex_test`.

## Project Structure

```txt
src/
  app.ts                         Express app and route mounting
  server.ts                      Database connection and HTTP startup
  config/                        Env and database config
  middleware/                    Validation, rate limit, request context, errors
  modules/
    auth/                        Register/login controller, service, routes, validators
    email/                       Email service and Resend HTTP provider
    verification/                OTP hash persistence and verification flow
    token/                       JWT, refresh token, and OTP token helpers
    session/                     Login session creation, session listing/revocation routes, validators
    auth-session/                Refresh-token session chain persistence
    user-session/                User device/session persistence
    users/                       User model/repository/types
    audit-event/                 Security audit logging
    notification/                User notification persistence
    application-error/           Server error persistence
    health/                      Health JSON and status HTML
  models/                        Business, role, invite, and member models
  repositories/                  Shared repository types
  services/                      IP location service
  utils/                         Hashing, cookies, JWT, errors, transactions
```

## Data Models Currently Present

- `User`
- `VerificationToken`
- `UserSession`
- `AuthSession`
- `AuditEvent`
- `Notification`
- `ApplicationError`
- `Business`
- `BusinessMember`
- `BusinessInvite`
- `Role`

## Frontend Handoff Files

These root-level files are provided to speed up frontend integration:

```txt
frontend.types.ts
frontend-auth-prompt.md
frontend-session-prompt.md
```

- `frontend.types.ts` contains frontend-safe TypeScript model and route types.
- `frontend-auth-prompt.md` describes the register/login/verify-email/resend-email flow.
- `frontend-session-prompt.md` describes wiring `dashboard/settings#sessions` with TanStack Query.

The frontend session prompt expects the shared frontend type file to be available as `generic.ts` if you moved/renamed it there.

## Notes

- Do not edit `dist/` manually. It is generated by `npm run build`.
- `dist/`, `node_modules/`, `.env`, and local data files are ignored by Git.
- The user `username` index should be a partial unique index. If MongoDB still has an old `username_1` unique index from an earlier schema, drop it once:

```js
db.users.dropIndex("username_1")
```
