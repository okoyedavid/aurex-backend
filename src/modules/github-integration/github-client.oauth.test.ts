import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { createGitHubClientFactory, GitHubApiError } from "./github-client.js";

const configuration = {
  ...env,
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "aurex",
  GITHUB_APP_CLIENT_ID: "client-id",
  GITHUB_APP_CLIENT_SECRET: "client-secret",
  GITHUB_APP_PRIVATE_KEY: "private-key",
};

describe("GitHub OAuth client", () => {
  it("exchanges a code through the provider layer", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "temporary-user-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const factory = createGitHubClientFactory(configuration, transport);

    await expect(factory.exchangeOAuthCode("one-time-code")).resolves.toBe(
      "temporary-user-token",
    );
    expect(transport).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          code: "one-time-code",
        }),
      }),
    );
  });

  it("sanitizes OAuth exchange errors", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "bad_verification_code",
          error_description: "raw provider details",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const factory = createGitHubClientFactory(configuration, transport);
    await expect(factory.exchangeOAuthCode("bad-code")).rejects.toMatchObject({
      code: "github_oauth_failed",
      message: "GitHub authorization could not be completed",
    });
  });

  it("retrieves the authorized user and their accessible installations", async () => {
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ id: 7, login: "admin" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          installations: [
            {
              id: 42,
              account: { id: 9, login: "acme", type: "Organization" },
              repository_selection: "selected",
              suspended_at: null,
            },
          ],
        }),
        { status: 200 },
      );
    });
    const client = createGitHubClientFactory(configuration, transport).forUser(
      "temporary-user-token",
    );

    await expect(client.getAuthenticatedUser()).resolves.toEqual({
      id: 7,
      login: "admin",
    });
    await expect(client.listInstallations()).resolves.toHaveLength(1);
    for (const [, options] of transport.mock.calls) {
      expect(options?.headers).toMatchObject({
        Authorization: "Bearer temporary-user-token",
      });
    }
  });

  it("marks a network exchange failure retryable without exposing the secret", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("network failed"));
    const factory = createGitHubClientFactory(configuration, transport);
    const error = await factory.exchangeOAuthCode("code").catch((value) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ retryable: true });
    expect(String(error)).not.toContain("client-secret");
  });
});
