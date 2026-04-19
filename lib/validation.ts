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
  /**
   * Si `true`, la sesión persiste 30 días aunque cierre el navegador.
   * Si `false`, la cookie es de sesión y caduca al cerrar el navegador.
   * Por defecto `true` (la mayoría de socios prefieren seguir logueados).
   * Acepta tanto boolean (JSON) como "on"/"true"/"1" (form data).
   */
  rememberMe: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        return v === "true" || v === "on" || v === "1";
      }
      return undefined;
    }, z.boolean().default(true)),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(64).max(128),
  password: z.string().min(8).max(128),
});

/**
 * Datos aceptados al crear/editar un evento de la programación desde el
 * panel admin. `startAt` acepta el formato `datetime-local`
 * (`YYYY-MM-DDTHH:mm`) que usa el input del formulario; el endpoint lo
 * normaliza a ISO 8601 con segundos y zona antes de guardar.
 */
export const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  startAt: z
    .string()
    .trim()
    .min(1)
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Fecha/hora no válida",
    }),
  imageKey: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^programacion\/[A-Za-z0-9._-]+$/i, {
      message: "Clave de imagen no válida",
    }),
  imageContentType: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("")),
  published: z.boolean(),
  showAsPopup: z.boolean().optional().default(false),
});

export const eventPatchSchema = eventSchema.partial();
