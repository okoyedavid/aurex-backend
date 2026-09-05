import { describe, expect, it } from "vitest";
import { createPolicySchema } from "./policy.validators.js";

const base = { params: { businessId: "68b000000000000000000001" }, query: {}, body: { categoryId: "68b000000000000000000002", name: "Backend GitHub access" } };

describe("GitHub policy configuration", () => {
  it("accepts a stable team target", () => {
    const result = createPolicySchema.safeParse({ ...base, body: { ...base.body, configuration: { provider: "github", resourceType: "team", organizationId: 1, organizationLogin: "acme", teamId: 2, teamSlug: "backend", role: "member" } } });
    expect(result.success).toBe(true);
  });

  it("accepts a direct repository target and supported permission", () => {
    const result = createPolicySchema.safeParse({ ...base, body: { ...base.body, configuration: { provider: "github", resourceType: "repository", repositoryId: 3, owner: "acme", repo: "api", permission: "maintain" } } });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported team maintainer access", () => {
    const result = createPolicySchema.safeParse({ ...base, body: { ...base.body, configuration: { provider: "github", resourceType: "team", organizationId: 1, organizationLogin: "acme", teamId: 2, teamSlug: "backend", role: "maintainer" } } });
    expect(result.success).toBe(false);
  });
});
