import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../app.js";

describe("GitHub OAuth callback route", () => {
  it("is publicly reachable and redirects missing parameters safely", async () => {
    const response = await request(app).get("/api/integrations/github/callback");
    expect(response.status).toBe(303);
    expect(response.headers.location).toContain(
      "/settings/integrations?github=error&reason=invalid_state",
    );
  });

  it("does not expose the retired manual completion endpoint", async () => {
    const response = await request(app)
      .post(
        "/api/businesses/68b000000000000000000001/integrations/github/complete",
      )
      .send({ installationId: 42, state: "state" });
    expect(response.status).toBe(404);
  });
});
