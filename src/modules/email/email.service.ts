import { env } from "../../config/env.js";

import { HttpError } from "../../utils/api-error.js";

type EmailHttpErrorFactory = (message: string, statusCode: number) => HttpError;

type SendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SendEmailResult = {
  id: string | null;
  provider: "console" | "resend";
};

type EmailProvider = {
  sendEmail: (payload: SendEmailPayload) => Promise<SendEmailResult>;
};

type SendVerificationOtpEmailPayload = {
  to: string;
  name?: string | null;
  otp: string;
};

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
      throw createHttpError("Failed to send verification email", 502);
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
          ? `Failed to send verification email: ${providerMessage}`
          : "Failed to send verification email",
        502,
      );
    }

    return {
      id: typeof responseBody?.id === "string" ? responseBody.id : null,
      provider: "resend",
    };
  },
});

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

  const sendVerificationOtpEmail = async ({
    to,
    name,
    otp,
  }: SendVerificationOtpEmailPayload) => {
    if (!to || !otp) {
      throw createHttpError("Email recipient and OTP are required", 500);
    }

    if (!provider || !fromEmail) {
      if (isProduction) {
        throw createHttpError("Email service is not configured", 500);
      }

      console.info(`[email:dev] Verification OTP for ${to}: ${otp}`);

      return { id: null, provider: "console" };
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
        <p>Hi ${recipientName},</p>
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em;">${otp}</p>
        <p>This code expires in 15 minutes.</p>
      </div>
    `;

    return provider.sendEmail({
      from: fromEmail,
      to: deliveryOverrideTo ?? to,
      subject,
      text,
      html,
    });
  };

  return {
    sendVerificationOtpEmail,
  };
};

export { createEmailService };
export type EmailService = ReturnType<typeof createEmailService>;
