import type { EmployeeRepository } from "./employee.repository.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { PaystackService } from "../paystack/paystack.service.js";

type WorkerDependencies = {
  employeeRepository: EmployeeRepository;
  employeeListRepository: EmployeeListRepository;
  paystackService: PaystackService;
  intervalMs: number;
  maxAttempts: number;
};

const createEmployeeVerificationWorker = ({
  employeeRepository,
  employeeListRepository,
  paystackService,
  intervalMs,
  maxAttempts,
}: WorkerDependencies) => {
  let timer: NodeJS.Timeout | null = null;
  let tickInProgress = false;

  const refreshEmployeeListProgress = async (employeeListId: string) => {
    const counts =
      await employeeRepository.countVerificationStatesByEmployeeListId(
        employeeListId,
      );
    const unfinished = counts.pending + counts.processing + counts.retrying;
    const hasErrors = counts.invalid > 0 || counts.exhausted > 0;
    const validationStatus =
      unfinished > 0
        ? counts.processing > 0
          ? "processing"
          : "pending"
        : hasErrors
          ? "completed_with_errors"
          : "completed";

    await employeeListRepository.updateEmployeeListById(employeeListId, {
      validationStatus,
      totalEmployeeCount: counts.total,
      pendingVerificationCount: unfinished,
      verifiedEmployeeCount: counts.verified,
      invalidEmployeeCount: counts.invalid,
      verificationErrorCount: counts.exhausted,
      lastValidationAt: unfinished === 0 ? new Date() : null,
      paymentStatus:
        counts.total > 0 && counts.verified === counts.total
          ? "payable"
          : hasErrors
            ? "blocked"
            : "needs_review",
      paymentBlockedReason: hasErrors
        ? "One or more employees could not be verified"
        : null,
    });
  };

  const processNextEmployee = async () => {
    // findOneAndUpdate makes claiming atomic, so two server instances cannot
    // process the same employee at the same time.
    const employee = await employeeRepository.claimNextVerification();
    if (!employee) return;

    const employeeId = employee.id;
    const employeeListId = String(employee.employeeListId);
    const attemptedAt = new Date();

    try {
      const resolution = await paystackService.resolveBankAccount({
        accountNumber: employee.accountNumber,
        bankCode: employee.bankCode,
      });

      if (
        resolution.outcome === "verified" &&
        resolution.data.accountNumber === employee.accountNumber
      ) {
        await employeeRepository.updateVerificationResult(employeeId, {
          $set: {
            accountName: resolution.data.accountName,
            accountVerificationStatus: "verified",
            verificationJobStatus: "completed",
            verificationMode: paystackService.verificationMode,
            accountVerifiedAt: attemptedAt,
            lastAccountValidationAt: attemptedAt,
            paymentStatus: "payable",
          },
          $unset: {
            accountVerificationFailureReason: 1,
            nextVerificationAttemptAt: 1,
            paymentBlockedReason: 1,
          },
        });
      } else if (resolution.outcome === "retryable_error") {
        const exhausted = employee.verificationAttemptCount >= maxAttempts;
        const retryDelayMs = Math.min(
          30_000 * 2 ** Math.max(employee.verificationAttemptCount - 1, 0),
          15 * 60_000,
        );

        await employeeRepository.updateVerificationResult(employeeId, {
          $set: {
            verificationJobStatus: exhausted ? "exhausted" : "retrying",
            verificationMode: paystackService.verificationMode,
            accountVerificationFailureReason: resolution.reason,
            lastAccountValidationAt: attemptedAt,
            paymentStatus: "blocked",
            ...(!exhausted && {
              nextVerificationAttemptAt: new Date(Date.now() + retryDelayMs),
            }),
          },
        });
      } else {
        const reason =
          resolution.outcome === "verified"
            ? "Resolved account number did not match the requested account"
            : resolution.reason;

        await employeeRepository.updateVerificationResult(employeeId, {
          $set: {
            accountVerificationStatus: "failed",
            verificationJobStatus: "completed",
            verificationMode: paystackService.verificationMode,
            accountVerificationFailureReason: reason,
            lastAccountValidationAt: attemptedAt,
            paymentStatus: "blocked",
          },
          $unset: { accountVerifiedAt: 1, nextVerificationAttemptAt: 1 },
        });
      }
    } catch (error) {
      const exhausted = employee.verificationAttemptCount >= maxAttempts;
      await employeeRepository.updateVerificationResult(employeeId, {
        $set: {
          verificationJobStatus: exhausted ? "exhausted" : "retrying",
          accountVerificationFailureReason:
            error instanceof Error ? error.message : "Verification failed",
          lastAccountValidationAt: attemptedAt,
          ...(!exhausted && {
            nextVerificationAttemptAt: new Date(Date.now() + 60_000),
          }),
        },
      });
    } finally {
      await refreshEmployeeListProgress(employeeListId);
    }
  };

  const tick = async () => {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      await processNextEmployee();
    } catch (error) {
      console.error("Employee verification worker failed", error);
    } finally {
      tickInProgress = false;
    }
  };

  const start = () => {
    if (timer || !paystackService.isConfigured()) return;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  return { processNextEmployee, start, stop };
};

export { createEmployeeVerificationWorker };
