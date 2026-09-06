import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { GitHubCallbackError } from "./github-connection.service.js";
import { createGitHubIntegrationController } from "./github-integration.controller.js";

const invokeCallback = async (
  query: Request["query"],
  completeOAuthCallback: ReturnType<typeof vi.fn>,
) => {
  let finish!: (value: { status: number; location: string }) => void;
  let fail!: (error: unknown) => void;
  const completed = new Promise<{ status: number; location: string }>(
    (resolve, reject) => {
      finish = resolve;
      fail = reject;
    },
  );
  const controller = createGitHubIntegrationController({
    connectionService: { completeOAuthCallback } as never,
    externalAccessService: {} as never,
  });
  const response = {
    redirect: (status: number, location: string) => {
      finish({ status, location });
      return response;
    },
  } as unknown as Response;
  controller.callback(
    { query } as Request,
    response,
    ((error?: unknown) => error && fail(error)) as NextFunction,
  );
  return completed;
};

describe("GitHub callback controller", () => {
  it("redirects a valid callback to the business integration page", async () => {
    const completeOAuthCallback = vi.fn().mockResolvedValue({
      businessId: "68b000000000000000000001",
      connection: { installationId: 42 },
    });
    const result = await invokeCallback(
      {
        code: "oauth-code",
        state: "state-with-at-least-twenty-characters",
        installation_id: "42",
      },
      completeOAuthCallback,
    );
    expect(result.status).toBe(303);
    expect(result.location).toContain(
      "/business/68b000000000000000000001/settings/integrations?github=connected",
    );
    expect(completeOAuthCallback).toHaveBeenCalledWith(
      "oauth-code",
      "state-with-at-least-twenty-characters",
      42,
    );
  });

  it.each([
    [{ state: "state-with-at-least-twenty-characters" }, "authorization_failed"],
    [{ code: "oauth-code" }, "invalid_state"],
  ])("redirects missing callback fields safely", async (query, reason) => {
    const result = await invokeCallback(query, vi.fn());
    expect(result.status).toBe(303);
    expect(result.location).toContain(`github=error&reason=${reason}`);
  });

  it("uses a safe reason and excludes raw provider errors and secrets", async () => {
    const completeOAuthCallback = vi
      .fn()
      .mockRejectedValue(
        new GitHubCallbackError(
          "installation_not_authorized",
          "68b000000000000000000001",
        ),
      );
    const result = await invokeCallback(
      {
        code: "secret-oauth-code",
        state: "secret-state-with-at-least-twenty-characters",
      },
      completeOAuthCallback,
    );
    expect(result.location).toContain(
      "github=error&reason=installation_not_authorized",
    );
    expect(result.location).not.toContain("secret-oauth-code");
    expect(result.location).not.toContain("secret-state");
  });
});
