export type CreateVerificationPayload = {
  userId: string;
  purpose: "verify_email" | "reset_password" | "change_email";
  tokenHash: string;
  expiresAt: Date;
  targetEmail?: string | null;
};
