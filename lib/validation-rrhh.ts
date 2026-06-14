import { z } from "zod";
import {
  captchaTokenField,
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  USER_SEX_VALUES,
} from "@/lib/validation";
import { POSITION_COLORS } from "@/lib/rrhh/positions";

/** `POST /api/admin/rrhh/workers/invite` */
export const inviteWorkerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
});

/**
 * `POST /api/rrhh/onboarding`. El trabajador completa su alta (cuenta +
 * ficha laboral con datos sensibles) a partir del token de invitación.
 */
export const workerOnboardingSchema = z
  .object({
    token: z.string().min(64).max(128),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(30),
    sex: z.enum(USER_SEX_VALUES),
    birthYear: z.coerce
      .number()
      .int()
      .min(MIN_BIRTH_YEAR, { message: "Año fuera de rango" })
      .max(MAX_BIRTH_YEAR, { message: "Debes ser mayor de 18 años" }),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    dni: z.string().trim().min(5).max(20),
    socialSecurityNumber: z.string().trim().min(5).max(30),
    iban: z.string().trim().min(15).max(34),
    address: z.string().trim().min(3).max(160),
    city: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(3).max(10),
    acceptTerms: z.literal(true, {
      message: "Debes aceptar las condiciones",
    }),
    captchaToken: captchaTokenField,
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

/**
 * `POST /api/admin/rrhh/workers/convert`. Un gestor convierte a un socio
 * existente en trabajador rellenando su ficha laboral con datos sensibles.
 */
export const convertWorkerSchema = z.object({
  userId: z.string().trim().min(1),
  dni: z.string().trim().min(5).max(20),
  socialSecurityNumber: z.string().trim().min(5).max(30),
  iban: z.string().trim().min(15).max(34),
  address: z.string().trim().min(3).max(160),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(10),
  position: z.string().trim().max(80).optional().or(z.literal("")),
});

/**
 * `PUT /api/admin/rrhh/workers/[userId]`. Edición de la ficha laboral por un
 * gestor (datos sensibles) una vez el trabajador ha completado su alta.
 */
export const editWorkerProfileSchema = z.object({
  dni: z.string().trim().min(5).max(20),
  socialSecurityNumber: z.string().trim().min(5).max(30),
  iban: z.string().trim().min(15).max(34),
  address: z.string().trim().min(3).max(160),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(10),
  position: z.string().trim().max(80).optional().or(z.literal("")),
});

/** `POST /api/admin/rrhh/positions` — alta de un puesto con su color pastel. */
export const createPositionSchema = z.object({
  name: z.string().trim().min(2, { message: "Nombre demasiado corto" }).max(40),
  color: z.enum(POSITION_COLORS),
});

const hhmm = z
  .string()
  .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: "Hora inválida (HH:mm)" });
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inválida (yyyy-MM-dd)" });

/** `POST /api/admin/rrhh/shifts` */
export const createShiftSchema = z
  .object({
    userId: z.string().min(1),
    jornadaDate: isoDate,
    start: hhmm,
    end: hhmm,
    note: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((v) => v.start !== v.end, {
    path: ["end"],
    message: "El fin no puede coincidir con el inicio",
  });

/** `PATCH /api/admin/rrhh/shifts/:shiftId` */
export const updateShiftSchema = z
  .object({
    start: hhmm,
    end: hhmm,
    note: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((v) => v.start !== v.end, {
    path: ["end"],
    message: "El fin no puede coincidir con el inicio",
  });

/** `POST /api/admin/rrhh/config` (parcial: al menos un campo) */
export const rrhhConfigSchema = z
  .object({
    jornadaStartHour: z.coerce.number().int().min(0).max(23).optional(),
    toleranceMin: z.coerce.number().int().min(0).max(120).optional(),
  })
  .refine((v) => v.jornadaStartHour !== undefined || v.toleranceMin !== undefined, {
    message: "Indica al menos un campo a actualizar",
  });
