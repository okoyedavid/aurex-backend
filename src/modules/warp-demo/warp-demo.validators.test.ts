import { describe, expect, it } from "vitest";
import * as schemas from "./warp-demo.validators.js";

const objectId = "68b000000000000000000001";

describe("Warp demo public request validation", () => {
  it("accepts the empty overview request", () => expect(schemas.emptyRequest.parse({ params: {}, query: {}, body: {} })).toBeTruthy());
  it("rejects businessId on overview", () => expect(() => schemas.emptyRequest.parse({ params: {}, query: { businessId: objectId }, body: {} })).toThrow());
  it("rejects businessId on policy listing", () => expect(() => schemas.policiesRequest.parse({ params: {}, query: { businessId: objectId }, body: {} })).toThrow());
  it("accepts safe policy filters", () => expect(schemas.policiesRequest.parse({ params: {}, query: { categoryId: objectId, status: "active" }, body: {} }).query).toEqual({ categoryId: objectId, status: "active" }));
  it("rejects unknown policy statuses", () => expect(() => schemas.policiesRequest.parse({ params: {}, query: { status: "deleted" }, body: {} })).toThrow());
  it("accepts a valid employee id", () => expect(schemas.employeeRequest.parse({ params: { employeeId: objectId }, query: {}, body: {} }).params.employeeId).toBe(objectId));
  it("rejects malformed employee ids", () => expect(() => schemas.employeeRequest.parse({ params: { employeeId: "bad" }, query: {}, body: {} })).toThrow());
  it("accepts a valid policy id", () => expect(schemas.policyRequest.parse({ params: { policyId: objectId }, query: {}, body: {} }).params.policyId).toBe(objectId));
  it("rejects malformed policy ids", () => expect(() => schemas.policyRequest.parse({ params: { policyId: "bad" }, query: {}, body: {} })).toThrow());
  it("defaults the audit limit to 25", () => expect(schemas.auditRequest.parse({ params: {}, query: {}, body: {} }).query.limit).toBe(25));
  it("coerces a safe audit limit", () => expect(schemas.auditRequest.parse({ params: {}, query: { limit: "50" }, body: {} }).query.limit).toBe(50));
  it("rejects an audit limit above 100", () => expect(() => schemas.auditRequest.parse({ params: {}, query: { limit: 101 }, body: {} })).toThrow());
  it("rejects an audit limit below 1", () => expect(() => schemas.auditRequest.parse({ params: {}, query: { limit: 0 }, body: {} })).toThrow());
  it("rejects unknown audit query keys", () => expect(() => schemas.auditRequest.parse({ params: {}, query: { raw: "true" }, body: {} })).toThrow());
  it("accepts safe audit filters", () => expect(schemas.auditRequest.parse({ params: {}, query: { employeeId: objectId, policyId: objectId, action: "ASSIGNMENT_CREATED" }, body: {} }).query).toMatchObject({ employeeId: objectId, policyId: objectId, action: "ASSIGNMENT_CREATED" }));
  it("accepts only the safe mutation union", () => expect(schemas.mutationRequest.parse({ params: { sessionId: "a".repeat(43) }, query: {}, body: { employee: "maya", field: "department", value: "finance" } }).body).toEqual({ employee: "maya", field: "department", value: "finance" }));
  it("rejects unsupported mutation values", () => expect(() => schemas.mutationRequest.parse({ params: { sessionId: "a".repeat(43) }, query: {}, body: { employee: "maya", field: "department", value: "legal" } })).toThrow());
  it("rejects unsupported fields and generic update objects", () => {
    expect(() => schemas.mutationRequest.parse({ params: { sessionId: "a".repeat(43) }, query: {}, body: { employee: "maya", field: "role", value: "owner" } })).toThrow();
    expect(() => schemas.mutationRequest.parse({ params: { sessionId: "a".repeat(43) }, query: {}, body: { employee: "maya", updates: { state: "anything" } } })).toThrow();
  });
  it("rejects arbitrary employee identifiers", () => expect(() => schemas.mutationRequest.parse({ params: { sessionId: "a".repeat(43) }, query: {}, body: { employee: objectId, field: "department", value: "finance" } })).toThrow());
});
