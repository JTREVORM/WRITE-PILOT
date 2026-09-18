import { z } from "zod";

/**
 * Input schemas shared by the client forms and the server actions.
 *
 * The same schema runs in both places: the browser copy gives instant feedback,
 * the server copy is the one that actually decides. Client-side validation is
 * never trusted on its own.
 */

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("Enter a valid email address")
  .max(254)
  .toLowerCase();

/**
 * Length is the property that actually resists guessing, so the floor is high
 * and the composition rule is minimal — a memorable passphrase should pass.
 * Keep this in step with the Supabase Auth password policy.
 */
const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Passwords can be at most 72 characters")
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: "Include at least one letter",
  })
  .refine((value) => /[0-9]/.test(value), {
    message: "Include at least one number",
  });

export const userTypeSchema = z.enum([
  "student",
  "researcher",
  "educator",
  "professional",
  "other",
]);

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your name")
      .max(120, "That name is too long"),
    email,
    password,
    confirmPassword: z.string(),
    userType: userTypeSchema.default("student"),
    country: z
      .string()
      .trim()
      .length(2, "Select your country")
      .toUpperCase()
      .optional()
      .or(z.literal("")),
    timezone: z.string().trim().max(64).optional(),
    marketingOptIn: z.boolean().default(false),
    acceptTerms: z.literal(true, {
      message: "Please accept the Terms and Privacy Policy to continue",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  country: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .optional()
    .or(z.literal("")),
  timezone: z.string().trim().max(64).optional(),
  userType: userTypeSchema,
  marketingOptIn: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
