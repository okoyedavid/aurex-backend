import { describe, expect, it } from "vitest";
import {
  getBusinessEmployeeSchema,
  listBusinessEmployeesSchema,
  updateBusinessEmployeeSchema,
} from "./employee.validators.js";

const businessId = "68b000000000000000000001";
const employeeId = "68b000000000000000000002";

describe("business employee request validation", () => {
  it("defaults pagination safely", () => expect(listBusinessEmployeesSchema.parse({ body: {}, params: { businessId }, query: {} }).query).toMatchObject({ page: 1, limit: 20 }));
  it("accepts all supported filters", () => expect(listBusinessEmployeesSchema.parse({ body: {}, params: { businessId }, query: { page: "2", limit: "50", search: "engineer", employeeListId: employeeId, employeeTypeId: employeeId, groupId: employeeId, state: "Lagos", status: "active" } }).query).toMatchObject({ page: 2, limit: 50, search: "engineer", state: "Lagos", status: "active" }));
  it("rejects limits over 100", () => expect(() => listBusinessEmployeesSchema.parse({ body: {}, params: { businessId }, query: { limit: 101 } })).toThrow());
  it("rejects page zero", () => expect(() => listBusinessEmployeesSchema.parse({ body: {}, params: { businessId }, query: { page: 0 } })).toThrow());
  it("rejects unsupported query keys", () => expect(() => listBusinessEmployeesSchema.parse({ body: {}, params: { businessId }, query: { businessMemberId: employeeId } })).toThrow());
  it("validates canonical detail IDs", () => expect(getBusinessEmployeeSchema.parse({ body: {}, params: { businessId, employeeId }, query: {} }).params).toEqual({ businessId, employeeId }));
  it("rejects malformed canonical detail IDs", () => expect(() => getBusinessEmployeeSchema.parse({ body: {}, params: { businessId, employeeId: "bad" }, query: {} })).toThrow());
  it("reuses employee update validation for canonical PATCH", () => expect(updateBusinessEmployeeSchema.parse({ body: { state: "Texas", groupIds: [] }, params: { businessId, employeeId }, query: {} }).body).toMatchObject({ state: "Texas", groupIds: [] }));
  it("rejects an empty canonical PATCH", () => expect(() => updateBusinessEmployeeSchema.parse({ body: {}, params: { businessId, employeeId }, query: {} })).toThrow());
});
