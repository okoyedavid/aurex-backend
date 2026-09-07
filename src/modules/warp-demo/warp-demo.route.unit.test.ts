import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createWarpDemoRouter } from "./warp-demo.route.js";

const handlers = ["createSession", "mutate", "reset", "reconciliationRun", "sessionEmployee", "sessionEmployeePolicies", "sessionExplain", "sessionAudit", "overview", "employees", "employee", "employeePolicies", "explain", "categories", "policies", "policy", "audit"] as const;
const controller = Object.fromEntries(handlers.map((name) => [name, (_req: express.Request, res: express.Response) => res.json({ route: name })])) as any;

const app = express();
app.use(express.json());
const limiter = vi.fn((_req: express.Request, res: express.Response, next: express.NextFunction) => { res.setHeader("x-demo-limiter", "applied"); next(); });
app.use("/api/demo/warp", createWarpDemoRouter(controller, limiter));
app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? 500).json({ message: error.message }));

describe("Warp demo public router", () => {
  it("serves overview without authentication", async () => { const response = await request(app).get("/api/demo/warp/overview"); expect(response.status).toBe(200); expect(response.body).toEqual({ route: "overview" }); });
  it("applies the dedicated limiter", async () => { const response = await request(app).get("/api/demo/warp/overview"); expect(response.headers["x-demo-limiter"]).toBe("applied"); expect(limiter).toHaveBeenCalled(); });
  it("does not expose POST mutations", async () => { expect((await request(app).post("/api/demo/warp/employees").send({})).status).toBe(404); });
  it("exposes only the constrained public mutation contract", async () => { const sessionId = "a".repeat(43); const response = await request(app).post(`/api/demo/warp/session/${sessionId}/mutations`).send({ employee: "maya", field: "department", value: "finance" }); expect(response.status).toBe(200); expect(response.body).toEqual({ route: "mutate" }); });
  it("rejects arbitrary employee ids and update objects", async () => { const sessionId = "a".repeat(43); expect((await request(app).post(`/api/demo/warp/session/${sessionId}/mutations`).send({ employee: "68b000000000000000000001", updates: { role: "owner" } })).status).toBe(400); });
  it("does not expose PATCH mutations", async () => { expect((await request(app).patch("/api/demo/warp/policies/68b000000000000000000001").send({})).status).toBe(404); });
  it("does not expose DELETE mutations", async () => { expect((await request(app).delete("/api/demo/warp/policies/68b000000000000000000001")).status).toBe(404); });
  it("rejects tenant selection on public list routes", async () => { expect((await request(app).get("/api/demo/warp/policies?businessId=68b000000000000000000001")).status).toBe(400); });
});
