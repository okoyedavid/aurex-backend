import { describe, expect, it, vi } from "vitest";
import { createHttpError } from "../../utils/api-error.js";
import { createEmailService } from "./email.service.js";
import type { EmailProvider } from "./email.types.js";

describe("business invitation email", () => {
  it("sends an escaped invitation through the configured provider", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      id: "email-1",
      provider: "resend" as const,
    });
    const emailProvider: EmailProvider = { sendEmail };
    const emailService = createEmailService({
      emailProvider,
      fromEmail: "Aurex <no-reply@example.com>",
      deliveryOverrideTo: "delivery-test@example.com",
      appName: "Aurex",
      isProduction: false,
      createHttpError,
    });

    const result = await emailService.sendBusinessInviteEmail({
      to: "recipient@example.com",
      recipientName: '<script>alert("recipient")</script>',
      inviterName: "Ada <Admin>",
      businessName: "Aurex & Partners",
      roleName: 'Finance "Manager"',
      inviteUrl: "https://app.example.com/invites/token?source=email&mode=accept",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ id: "email-1", provider: "resend" });
    expect(sendEmail).toHaveBeenCalledOnce();
    const payload = sendEmail.mock.calls[0]?.[0];
    expect(payload.to).toBe("delivery-test@example.com");
    expect(payload.text).toContain("https://app.example.com/invites/token");
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("Aurex &amp; Partners");
    expect(payload.html).toContain("source=email&amp;mode=accept");
  });

  it("does not log the invitation URL in development fallback mode", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const emailService = createEmailService({
      emailProvider: null,
      fromEmail: undefined,
      appName: "Aurex",
      isProduction: false,
      createHttpError,
    });
    const inviteUrl = "https://app.example.com/invites/secret-token";

    const result = await emailService.sendBusinessInviteEmail({
      to: "recipient@example.com",
      inviterName: "Ada",
      businessName: "Aurex",
      roleName: "Viewer",
      inviteUrl,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(result.provider).toBe("console");
    expect(consoleInfo).toHaveBeenCalledOnce();
    expect(consoleInfo.mock.calls.flat().join(" ")).not.toContain(inviteUrl);
    consoleInfo.mockRestore();
  });

  it("rejects non-HTTP invitation URLs", async () => {
    const emailService = createEmailService({
      emailProvider: null,
      isProduction: false,
      createHttpError,
    });

    await expect(
      emailService.sendBusinessInviteEmail({
        to: "recipient@example.com",
        inviterName: "Ada",
        businessName: "Aurex",
        roleName: "Viewer",
        inviteUrl: "javascript:alert(1)",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
