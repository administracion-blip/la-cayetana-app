import { z } from "zod";

/** Año actual evaluado al cargar el módulo (suficiente para validar alta). */
const CURRENT_YEAR = new Date().getUTCFullYear();
/** Mayoría de edad (18 años cumplidos como muy tarde este año). */
export const MAX_BIRTH_YEAR = CURRENT_YEAR - 18;
/** Límite superior de edad (100 años). */
export const MIN_BIRTH_YEAR = CURRENT_YEAR - 100;

export const USER_SEX_VALUES = ["male", "female", "prefer_not_to_say"] as const;

export const registrationStartSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email(),
    phone: z.string().trim().min(6).max(30),
    sex: z.enum(USER_SEX_VALUES),
    birthYear: z.coerce
      .number()
      .int()
      .min(MIN_BIRTH_YEAR, { message: "Año fuera de rango" })
      .max(MAX_BIRTH_YEAR, { message: "Debes ser mayor de 18 años" }),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    acceptTerms: z.literal(true, {
      message: "Debes aceptar las condiciones",
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
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
