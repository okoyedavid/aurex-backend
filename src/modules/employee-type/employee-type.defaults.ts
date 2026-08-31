export const defaultEmployeeTypes = [
  { key: "full_time", name: "Full Time" },
  { key: "part_time", name: "Part Time" },
  { key: "contractor", name: "Contractor" },
  { key: "intern", name: "Intern" },
] as const;

export type DefaultEmployeeTypeKey =
  (typeof defaultEmployeeTypes)[number]["key"];
