import type { CreateEmployeeInput } from "../employee/employee.types.js";

export type EmployeeListPaymentStatus =
  | "payable"
  | "blocked"
  | "needs_review";

export type EmployeeListValidationStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_errors";

export type CreateEmployeeListInput = {
  name: string;
  description?: string | null;
  currency?: string;
  defaultPayFrequency?: "weekly" | "bi-weekly" | "monthly" | "one_time";
  paymentStatus?: EmployeeListPaymentStatus;
  paymentBlockedReason?: string;
  employees?: CreateEmployeeInput[];
};

export type CreateEmployeeList = Omit<CreateEmployeeListInput, "employees"> & {
  businessId: string;
  createdByUserId: string;
  validationStatus?: EmployeeListValidationStatus;
  lastValidationAt?: Date;
  totalEmployeeCount?: number;
  pendingVerificationCount?: number;
  verifiedEmployeeCount?: number;
  invalidEmployeeCount?: number;
  verificationErrorCount?: number;
};

export type UpdateEmployeeList = Partial<{
  status: "active" | "archived";
  name: string;
  description?: string | null;
  currency: string;
  defaultPayFrequency?: "weekly" | "bi-weekly" | "monthly" | "one_time";
  paymentStatus: EmployeeListPaymentStatus;
  paymentBlockedReason: string | null;
  validationStatus: EmployeeListValidationStatus;
  lastValidationAt: Date | null;
  totalEmployeeCount: number;
  pendingVerificationCount: number;
  verifiedEmployeeCount: number;
  invalidEmployeeCount: number;
  verificationErrorCount: number;
}>;

export type UpdateEmployeeListInput = Partial<{
  name: string;
  description: string | null;
  currency: string;
  defaultPayFrequency: "weekly" | "bi-weekly" | "monthly" | "one_time";
}>;
