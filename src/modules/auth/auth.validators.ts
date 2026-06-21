import { z } from "zod";

const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
  }),
  params: z.object({}),
  query: z.object({}),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72),
  }),
  params: z.object({}),
  query: z.object({}),
});

const passwordResetSchema = z.object({
  body: z.object({
    newPassword: z.string().min(8).max(72),
    password: z.string().min(8).max(72),
  }),
  params: z.object({}),
  query: z.object({}),
});

const googleLoginSchema = z.object({
  body: z
    .object({
      idToken: z.string().trim().min(1).optional(),
      credential: z.string().trim().min(1).optional(),
    })
    .refine((body) => body.idToken || body.credential, {
      message: "Google ID token is required",
      path: ["idToken"],
    })
    .transform((body) => ({
      idToken: body.idToken ?? body.credential,
    })),
  params: z.object({}),
  query: z.object({}),
});

const resendEmailSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const deleteProviderSchema = z.object({
  body: z.object({}),
  params: z.object({
    provider: z.enum(["password", "github", "google"]),
  }),
  query: z.object({}),
});

const changeEmailSchema = z.object({
  body: z.object({
    newEmail: z.string().trim().toLowerCase().email(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const verifyEmailChangeSchema = z.object({
  body: z.object({
    otp: z.string().trim().length(6).regex(/^\d+$/, "OTP must be numeric"),
  }),
  params: z.object({}),
  query: z.object({}),
});

const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    otp: z.string().trim().length(6).regex(/^\d+$/, "OTP must be numeric"),
  }),
  params: z.object({}),
  query: z.object({}),
});

const refreshSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({}),
  query: z.object({}),
});

const updateUserSchema = z.object({
  body: z
    .object({
      name: z.string().min(4).optional(),
      bio: z.string().min(8).max(250).optional(),
      username: z.string().optional(),
    })
    .refine(
      (data) => Object.values(data).some((v) => v !== undefined && v !== ""),
      {
        message: "At least one field must be provided",
      },
    ),

  params: z.object({}),
  query: z.object({}),
});

const logoutSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({}),
  query: z.object({}),
});

export {
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  changeEmailSchema,
  resendEmailSchema,
  verifyEmailChangeSchema,
  verifyEmailSchema,
  deleteProviderSchema,
  passwordResetSchema,
  updateUserSchema,
};
