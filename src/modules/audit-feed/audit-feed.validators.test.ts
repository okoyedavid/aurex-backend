import { describe, expect, it } from "vitest";
import { listBusinessAuditSchema, listPersonalAuditSchema } from "./audit-feed.validators.js";

const businessId = "68b000000000000000000001";

describe("audit feed validators", () => {
  it("uses the shared pagination defaults", () => {
    expect(listBusinessAuditSchema.parse({ params: { businessId }, query: {} }).query).toMatchObject({ page: 1, limit: 20 });
  });

  it("rejects attempts to select another member through personal audit", () => {
    expect(() => listPersonalAuditSchema.parse({ params: { businessId }, query: { memberId: "68b000000000000000000002" } })).toThrow();
  });

  it("rejects unsupported domains", () => {
    expect(() => listBusinessAuditSchema.parse({ params: { businessId }, query: { domain: "application_error" } })).toThrow();
  });
});
