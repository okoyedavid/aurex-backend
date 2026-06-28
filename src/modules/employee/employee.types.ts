export type PayFrequency = "weekly" | "bi-weekly" | "monthly" | "one_time";

export type EmployeeStatus = "active" | "suspended" | "on leave" | "archived";

export type AccountVerificationStatus =
  | "unverified"
  | "verified"
  | "failed"
  | "stale";

export type VerificationJobStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "completed"
  | "exhausted";

export type VerificationMode = "demo" | "live";

export type EmployeePaymentStatus = "payable" | "blocked";

export type CreateEmployeeInput = {
  fullName: string;
  jobTitle?: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName?: string;
  accountVerificationStatus?: AccountVerificationStatus;
  verificationJobStatus?: VerificationJobStatus;
  verificationMode?: VerificationMode;
  verificationAttemptCount?: number;
  accountVerifiedAt?: Date | null;
  accountVerificationFailureReason?: string | null;
  lastAccountValidationAt?: Date | null;
  nextVerificationAttemptAt?: Date | null;
  amount: number;
  currency?: string;
  payFrequency?: PayFrequency;
  paymentStatus?: EmployeePaymentStatus;
  paymentBlockedReason?: string;
};

export type CreateEmployeePayload = CreateEmployeeInput & {
  businessId: string;
  employeeListId: string;
};

export type UpdateEmployeePayload = Partial<{
  employeeListId: string;
  fullName: string;
  jobTitle: string | null;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountVerificationStatus: AccountVerificationStatus;
  verificationJobStatus: VerificationJobStatus;
  verificationMode: VerificationMode;
  verificationAttemptCount: number;
  accountVerifiedAt: Date | null;
  accountVerificationFailureReason: string | null;
  lastAccountValidationAt: Date | null;
  nextVerificationAttemptAt: Date | null;
  amount: number;

  currency: string;
  payFrequency: PayFrequency;
  totalAmountPaid: number;
  lastPaidAt: Date | null;
  paymentStatus: EmployeePaymentStatus;
  paymentBlockedReason: string | null;
  status: EmployeeStatus;
}>;

export type UpdateEmployeeInput = Partial<{
  fullName: string;
  jobTitle: string | null;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  amount: number;
  currency: string;
  payFrequency: PayFrequency;
}>;

export type FindEmployeesFilters = {
  accountVerificationStatus?: AccountVerificationStatus;
  verificationJobStatus?: VerificationJobStatus;
  employeeListId?: string;
  paymentStatus?: EmployeePaymentStatus;
  status?: EmployeeStatus;
};
