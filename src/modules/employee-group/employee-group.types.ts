import type { DefaultEmployeeGroupKey } from "./employee-group.defaults.js";

export type EmployeeGroupStatus = "active" | "archived";

export type CreateEmployeeGroupInput =
  | { templateKey: DefaultEmployeeGroupKey }
  | { name: string; description?: string | null };

export type UpdateEmployeeGroupInput = Partial<{
  name: string;
  description: string | null;
  status: EmployeeGroupStatus;
}>;
