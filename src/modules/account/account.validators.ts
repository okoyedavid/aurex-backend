import { z } from "zod";

const requestEmailChangeSchema = z.object({
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

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8).max(72),
    newPassword: z
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

const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(50).optional(),
      username: z.string().trim().toLowerCase().optional().nullable(),
      bio: z.string().trim().max(250).optional().nullable(),
    })
    .refine(
      (data) => Object.values(data).some((value) => value !== undefined),
      {
        message: "At least one field must be provided",
      },
    ),
  params: z.object({}),
  query: z.object({}),
});

const updateAvatarSchema = z.object({
  body: z.object({
    avatar: z.string().trim().url(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const deleteAvatarSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({}),
  query: z.object({}),
});

const updatePreferencesSchema = z.object({
  body: z.object({
    preferences: z
      .object({
        twoFactorEnabled: z.boolean().optional(),
      })
      .refine(
        (data) => Object.values(data).some((value) => value !== undefined),
        {
          message: "At least one preference must be provided",
        },
      ),
  }),
  params: z.object({}),
  query: z.object({}),
});

export {
  changePasswordSchema,
  deleteAvatarSchema,
  requestEmailChangeSchema,
  updateAvatarSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailChangeSchema,
};
