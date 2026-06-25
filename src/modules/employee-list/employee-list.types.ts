export type EmployeeListPaymentStatus =
  | "payable"
  | "blocked"
  | "needs_review";

export type CreateEmployeeList = {
  businessId: string;
  name: string;
  description?: string;
  currency?: string;
  defaultPayFrequency?: "weekly" | "bi-weekly" | "monthly" | "one_time";
  paymentStatus?: EmployeeListPaymentStatus;
  paymentBlockedReason?: string;
  lastValidationAt?: Date;
  invalidEmployeeCount?: number;
  createdByUserId: string;
};

export type UpdateEmployeeList = Partial<{
  status: "active" | "archived";
  name: string;
  description?: string;
  currency: string;
  defaultPayFrequency?: "weekly" | "bi-weekly" | "monthly" | "one_time";
  paymentStatus: EmployeeListPaymentStatus;
  paymentBlockedReason: string | null;
  lastValidationAt: Date | null;
  invalidEmployeeCount: number;
}>;

export type updateEmployeeList = UpdateEmployeeList;
