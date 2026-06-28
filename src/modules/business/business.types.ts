import type { CreateEmployeeListInput } from "../employee-list/employee-list.types.js";

export type CreateBusinessPayload = {
  name: string;
  ownerUserId: string;
  industry: string;
  profile_img?: string;
};

export type CreateBusinessInput = CreateBusinessPayload & {
  employeeLists?: CreateEmployeeListInput[];
};
