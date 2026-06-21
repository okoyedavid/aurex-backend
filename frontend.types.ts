export type Id = string;
export type ISODateString = string;

export type UserStatus = "active" | "inactive";
export type BusinessStatus = "active" | "suspended";
export type BusinessMemberStatus = "active" | "suspended" | "removed";
export type BusinessInviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";
export type RoleType = "system" | "custom";
export type VerificationPurpose =
  | "verify_email"
  | "reset_password"
  | "change_email";
export type NotificationSeverity = "info" | "warning" | "error" | "critical";
export type AuditEventCategory =
  | "authentication"
  | "account"
  | "session"
  | "security";
export type AuditEventOutcome = "success" | "failure" | "blocked";

export type Permission =
  | "business:update"
  | "members:invite"
  | "members:remove"
  | "members:update_role"
  | "payments:create"
  | "payments:view"
  | "payments:view_own"
  | "payments:approve"
  | "payments:cancel"
  | "providers:create"
  | "providers:update"
  | "providers:view"
  | "invoices:create"
  | "invoices:view"
  | "reports:view"
  | "audit_logs:view";

export type RequestMetadata = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
};

export type LocationMetadata = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type User = {
  id: Id;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  username?: string | null;
  email: string;
  emailVerifiedAt: ISODateString | null;
  status: UserStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Business = {
  id: Id;
  name: string;
  ownerUserId: Id;
  industry: string;
  defaultCurrency: string;
  status: BusinessStatus;
  isVerified: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type BusinessMember = {
  id: Id;
  businessId: Id;
  userId: Id;
  roleId: Id;
  status: BusinessMemberStatus;
  invitedByUserId: Id | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type BusinessInvite = {
  id: Id;
  businessId: Id;
  email: string;
  roleId: Id;
  invitedByUserId: Id;
  acceptedByUserId: Id | null;
  status: BusinessInviteStatus;
  expiresAt: ISODateString;
  acceptedAt: ISODateString | null;
  revokedAt: ISODateString | null;
  revokedByUserId: Id | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Role = {
  id: Id;
  businessId: Id | null;
  name: string;
  key: string;
  type: RoleType;
  permissions: Permission[];
  deniedPermissions: Permission[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type VerificationToken = {
  id: Id;
  userId: Id;
  purpose: VerificationPurpose;
  expiresAt: ISODateString;
  targetEmail: string | null;
  usedAt: ISODateString | null;
};

export type UserSession = {
  id: Id;
  userId: Id;
  userSessionId: string;
  currentAuthSessionId: string | null;
  userAgent: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lastSeenAt: ISODateString;
  createdAt: ISODateString;
  expiresAt: ISODateString;
  revokedAt: ISODateString | null;
};

export type AuthSession = {
  id: Id;
  userId: Id;
  userSessionId: string;
  sessionId: string;
  lastSeenAt: ISODateString;
  createdAt: ISODateString;
  expiresAt: ISODateString;
  revokedAt: ISODateString | null;
  replacedBySessionId: string | null;
};

export type AuditEventChanges = {
  fields?: string[];
  before?: unknown;
  after?: unknown;
};

export type AuditEvent = {
  id: Id;
  eventId: string;
  eventType: string;
  category: AuditEventCategory;
  outcome: AuditEventOutcome;
  severity: NotificationSeverity;
  userId: Id | null;
  emailHash: string | null;
  userSessionId: string | null;
  authSessionId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  reason: string | null;
  changes?: AuditEventChanges;
  metadata?: unknown;
  createdAt: ISODateString;
};

export type Notification = {
  id: Id;
  userId: Id;
  auditEventId: Id;
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  readAt: ISODateString | null;
  createdAt: ISODateString;
};

export type ApplicationError = {
  id: Id;
  errorId: string;
  requestId: string;
  name: string;
  message: string;
  code: string | null;
  stack: string | null;
  statusCode: number;
  method: string;
  path: string;
  userId: Id | null;
  userSessionId: string | null;
  authSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  environment: string;
  release: string | null;
  resolvedAt: ISODateString | null;
  createdAt: ISODateString;
};

export type TokenPayload = {
  userId: Id;
  userSessionId: string;
  sessionId: string;
};

export type LoginBody = {
  email: string;
  password: string;
};

export type LoginResponse = {
  message: "Login successful";
  user: User;
};

export type RegisterBody = {
  name: string;
  email: string;
  password: string;
};

export type RegisterResponse = {
  message: "User registered successfully. Check your email for the OTP.";
  user: User;
};

export type ResendEmailBody = {
  email: string;
};

export type ResendEmailResponse = {
  message: "Email sent successfully!";
};

export type VerifyEmailBody = {
  email: string;
  otp: string;
};

export type VerifyEmailResponse = {
  message: "Email verified successfully";
  user: User;
};

export type SendNewEmailCodeBody = {
  newEmail: string;
};

export type VerifyEmailChangeBody = {
  otp: string;
};

export type ApiErrorResponse = {
  message: string;
  requestId?: string | null;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  stack?: string;
};

export type AuthRouteErrorResponse = ApiErrorResponse;

export type AuthRouteError = {
  ok: false;
  status: 400 | 401 | 404 | 409 | 429 | 500;
  error: AuthRouteErrorResponse;
};

export type LoginResult =
  | ({ ok: true; status: 200 } & LoginResponse)
  | AuthRouteError;

export type RegisterResult =
  | ({ ok: true; status: 201 } & RegisterResponse)
  | AuthRouteError;

export type VerifyEmailResult =
  | ({ ok: true; status: 200 } & VerifyEmailResponse)
  | AuthRouteError;

export type ResendEmailResult =
  | ({ ok: true; status: 201 } & ResendEmailResponse)
  | AuthRouteError;

export type AuthVerificationFlowState = {
  email: string;
  registrationUser?: User;
  resendCooldownSeconds?: number;
};

export type ApiSuccessResponse<T> = {
  data: T;
  message?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
