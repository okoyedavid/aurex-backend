import type { DefaultEmployeeTypeKey } from "./employee-type.defaults.js";

export type EmployeeTypeStatus = "active" | "archived";

export type CreateEmployeeTypeInput =
  | { templateKey: DefaultEmployeeTypeKey }
  | { name: string; description?: string | null };

export type UpdateEmployeeTypeInput = Partial<{
  name: string;
  description: string | null;
  status: EmployeeTypeStatus;
}>;
