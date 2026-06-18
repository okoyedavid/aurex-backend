import {
  LocationMetadata,
  RequestMetadata,
} from "../../repositories/repository-types.js";
import { ApiError } from "../../utils/api-error.js";
import type { UserRepository } from "../users/user.repository.js";
import { AuditEventService } from "../audit-event/audit-event.service.js";

type CreateErrorService = {
  userRepository: UserRepository;
  auditEventService: AuditEventService;
};

const createErrorService = ({
  userRepository,
  auditEventService,
}: CreateErrorService) => {
  const recordFailedLogin = async ({
    email,
    requestMetadata,
    location,
    error,
  }: {
    email: string;
    requestMetadata: RequestMetadata;
    location: LocationMetadata;
    error: ApiError;
  }) => {
    const attemptedUser = await userRepository
      .findUserByEmail(email)
      .catch(() => null);

    await auditEventService.recordEventSafely({
      eventType: "auth.login.failed",
      category: "authentication",
      outcome: "failure",
      severity: "warning",
      userId: attemptedUser?.id ?? null,
      email,
      requestMetadata,
      location,
      reason: error.statusCode === 401 ? "invalid_credentials" : "login_failed",
    });
  };

  return { recordFailedLogin };
};

export { createErrorService };
export type ErrorService = ReturnType<typeof createErrorService>;
