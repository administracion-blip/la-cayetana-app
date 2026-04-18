import { z } from "zod";

export const activateSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().max(30).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(64).max(128),
  password: z.string().min(8).max(128),
});
