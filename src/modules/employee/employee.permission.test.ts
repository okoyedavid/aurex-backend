import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";

const runGuard = async (permissions: string[], deniedPermissions: string[] = []) => {
  vi.spyOn(
    businessMemberRepository,
    "findActiveMembershipByBusinessAndUser",
  ).mockResolvedValue({ roleId: { permissions, deniedPermissions } } as never);

  return new Promise<{ status: number | null; nextCalled: boolean }>((resolve) => {
    let status: number | null = null;
    const req = {
      user: { id: "user-1" },
      validatedParams: { businessId: "68b000000000000000000001" },
    } as unknown as Request;
    const res = {
      status: vi.fn((value: number) => {
        status = value;
        return res;
      }),
      json: vi.fn(() => {
        resolve({ status, nextCalled: false });
        return res;
      }),
    } as unknown as Response;
    const next = vi.fn(() =>
      resolve({ status: null, nextCalled: true }),
    ) as NextFunction;

    requireBusinessPermission("employees:view")(req, res, next);
  });
};

describe("employee business-wide permission boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows employees:view", async () =>
    expect(await runGuard(["employees:view"])).toEqual({
      status: null,
      nextCalled: true,
    }));

  it("does not treat employees:view_own as business-wide view", async () =>
    expect(await runGuard(["employees:view_own"])).toEqual({
      status: 403,
      nextCalled: false,
    }));

  it("preserves explicit denial precedence", async () =>
    expect(
      await runGuard(["employees:view"], ["employees:view"]),
    ).toEqual({ status: 403, nextCalled: false }));
});
