export type PayFrequency = "weekly" | "bi-weekly" | "monthly" | "one_time";

export type EmployeeStatus = "active" | "suspended" | "on leave" | "archived";

export type AccountVerificationStatus =
  | "unverified"
  | "verified"
  | "failed"
  | "stale";

export type EmployeePaymentStatus = "payable" | "blocked";

export type CreateEmployeePayload = {
  businessId: string;
  employeeListId: string;
  fullName: string;
  jobTitle?: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountVerificationStatus?: AccountVerificationStatus;
  accountVerifiedAt?: Date;
  accountVerificationFailureReason?: string;
  lastAccountValidationAt?: Date;
  amount: number;
  currency?: string;
  payFrequency?: PayFrequency;
  paymentStatus?: EmployeePaymentStatus;
  paymentBlockedReason?: string;
};

export type UpdateEmployeePayload = Partial<{
  employeeListId: string;
  fullName: string;
  jobTitle: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountVerificationStatus: AccountVerificationStatus;
  accountVerifiedAt: Date | null;
  accountVerificationFailureReason: string | null;
  lastAccountValidationAt: Date | null;
  amount: number;

  currency: string;
  payFrequency: PayFrequency;
  totalAmountPaid: number;
  lastPaidAt: Date | null;
  paymentStatus: EmployeePaymentStatus;
  paymentBlockedReason: string | null;
  status: EmployeeStatus;
}>;

export type FindEmployeesFilters = {
  accountVerificationStatus?: AccountVerificationStatus;
  employeeListId?: string;
  paymentStatus?: EmployeePaymentStatus;
  status?: EmployeeStatus;
};
