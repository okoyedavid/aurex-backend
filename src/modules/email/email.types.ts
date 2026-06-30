export type SendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendEmailResult = {
  id: string | null;
  provider: "console" | "resend";
};

export type EmailProvider = {
  sendEmail: (payload: SendEmailPayload) => Promise<SendEmailResult>;
};

export type SendVerificationOtpEmailPayload = {
  to: string;
  name?: string | null;
  otp: string;
};

export type SendBusinessInviteEmailPayload = {
  to: string;
  recipientName?: string | null;
  inviterName: string;
  businessName: string;
  roleName: string;
  inviteUrl: string;
  expiresAt: Date;
};
