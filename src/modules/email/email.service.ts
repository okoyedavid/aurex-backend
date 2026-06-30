import { env } from "../../config/env.js";

import { HttpError } from "../../utils/api-error.js";
import type {
  EmailProvider,
  SendBusinessInviteEmailPayload,
  SendVerificationOtpEmailPayload,
} from "./email.types.js";

type EmailHttpErrorFactory = (message: string, statusCode: number) => HttpError;

type ResendErrorResponse = {
  message?: unknown;
  name?: unknown;
  error?: unknown;
};

type CreateResendEmailProviderDependencies = {
  apiKey: string;
  createHttpError: EmailHttpErrorFactory;
  fetchEmail?: typeof fetch;
};

type CreateEmailServiceDependencies = {
  emailProvider?: EmailProvider | null;
  resendApiKey?: string;
  fromEmail?: string;
  deliveryOverrideTo?: string;
  appName?: string;
  isProduction?: boolean;
  createHttpError: EmailHttpErrorFactory;
};

const getResendErrorMessage = (responseBody: ResendErrorResponse | null) => {
  if (typeof responseBody?.message === "string") {
    return responseBody.message;
  }

  if (typeof responseBody?.error === "string") {
    return responseBody.error;
  }

  return null;
};

const createResendEmailProvider = ({
  apiKey,
  createHttpError,
  fetchEmail = fetch,
}: CreateResendEmailProviderDependencies): EmailProvider => ({
  sendEmail: async (payload) => {
    let response: Response;

    try {
      response = await fetchEmail("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (_error) {
      throw createHttpError("Failed to send email", 502);
    }

    const responseBody = (await response.json().catch(() => null)) as
      | (ResendErrorResponse & { id?: unknown })
      | null;

    if (!response.ok) {
      const providerMessage = getResendErrorMessage(responseBody);

      console.error("Resend email failed", {
        status: response.status,
        message: providerMessage,
      });

      throw createHttpError(
        providerMessage
          ? `Failed to send email: ${providerMessage}`
          : "Failed to send email",
        502,
      );
    }

    return {
      id: typeof responseBody?.id === "string" ? responseBody.id : null,
      provider: "resend",
    };
  },
});

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return entities[character] ?? character;
  });

const requireHttpUrl = (value: string) => {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported invite URL protocol");
    }

    return url.toString();
  } catch (_error) {
    throw new Error("A valid HTTP invitation URL is required");
  }
};

const normalizeEmailHeader = (value: string) =>
  value.replace(/[\r\n]+/g, " ").trim();

const createEmailService = ({
  emailProvider,
  resendApiKey = env.RESEND_API_KEY,
  fromEmail = env.EMAIL_FROM,
  deliveryOverrideTo = env.EMAIL_DELIVERY_OVERRIDE_TO,
  appName = env.APP_NAME,
  isProduction = env.NODE_ENV === "production",
  createHttpError,
}: CreateEmailServiceDependencies) => {
  const provider =
    emailProvider !== undefined
      ? emailProvider
      : resendApiKey
        ? createResendEmailProvider({ apiKey: resendApiKey, createHttpError })
        : null;

  const sendPreparedEmail = async ({
    to,
    subject,
    text,
    html,
    developmentDescription,
  }: {
    to: string;
    subject: string;
    text: string;
    html: string;
    developmentDescription: string;
  }) => {
    if (!provider || !fromEmail) {
      if (isProduction) {
        throw createHttpError("Email service is not configured", 500);
      }

      console.info(`[email:dev] ${developmentDescription} for ${to}`);
      return { id: null, provider: "console" as const };
    }

    return provider.sendEmail({
      from: fromEmail,
      to: deliveryOverrideTo ?? to,
      subject,
      text,
      html,
    });
  };

  const sendVerificationOtpEmail = async ({
    to,
    name,
    otp,
  }: SendVerificationOtpEmailPayload) => {
    if (!to || !otp) {
      throw createHttpError("Email recipient and OTP are required", 500);
    }

    const subject = `Verify your email for ${appName}`;
    const recipientName = name?.trim() || "there";
    const text = [
      `Hi ${recipientName},`,
      "",
      `Your verification code is: ${otp}`,
      "",
      "This code expires in 15 minutes.",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hi ${escapeHtml(recipientName)},</p>
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em;">${otp}</p>
        <p>This code expires in 15 minutes.</p>
      </div>
    `;

    return sendPreparedEmail({
      to,
      subject,
      text,
      html,
      developmentDescription: `Verification OTP generated: ${otp}`,
    });
  };

  const sendBusinessInviteEmail = async ({
    to,
    recipientName,
    inviterName,
    businessName,
    roleName,
    inviteUrl,
    expiresAt,
  }: SendBusinessInviteEmailPayload) => {
    if (!to || !inviterName || !businessName || !roleName || !inviteUrl) {
      throw createHttpError("Business invitation email data is incomplete", 500);
    }

    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
      throw createHttpError("A valid invitation expiry is required", 500);
    }

    let normalizedInviteUrl: string;

    try {
      normalizedInviteUrl = requireHttpUrl(inviteUrl);
    } catch (_error) {
      throw createHttpError("A valid HTTP invitation URL is required", 500);
    }

    const greetingName = recipientName?.trim() || "there";
    const expiration = expiresAt.toUTCString();
    const subject = normalizeEmailHeader(
      `${inviterName} invited you to join ${businessName}`,
    );
    const text = [
      `Hi ${greetingName},`,
      "",
      `${inviterName} invited you to join ${businessName} as ${roleName}.`,
      "",
      `Accept the invitation: ${normalizedInviteUrl}`,
      "",
      `This invitation expires on ${expiration}.`,
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hi ${escapeHtml(greetingName)},</p>
        <p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(businessName)}</strong> as <strong>${escapeHtml(roleName)}</strong>.</p>
        <p>
          <a href="${escapeHtml(normalizedInviteUrl)}" style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 4px;">
            Accept invitation
          </a>
        </p>
        <p>This invitation expires on ${escapeHtml(expiration)}.</p>
        <p>If you were not expecting this invitation, you can ignore this email.</p>
      </div>
    `;

    return sendPreparedEmail({
      to,
      subject,
      text,
      html,
      developmentDescription: "Business invitation email prepared",
    });
  };

  return {
    sendBusinessInviteEmail,
    sendVerificationOtpEmail,
  };
};

export { createEmailService, createResendEmailProvider };
export type EmailService = ReturnType<typeof createEmailService>;
