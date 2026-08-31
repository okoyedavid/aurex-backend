export const defaultEmployeeGroups = [
  { key: "engineering", name: "Engineering" },
  { key: "marketing", name: "Marketing" },
  { key: "finance", name: "Finance" },
  { key: "hr", name: "HR" },
] as const;

export type DefaultEmployeeGroupKey =
  (typeof defaultEmployeeGroups)[number]["key"];
