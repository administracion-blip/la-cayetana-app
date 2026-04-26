/**
 * Schemas Zod específicos del módulo de reservas. Se mantienen aparte de
 * `lib/validation.ts` para evitar que ese archivo se vuelva una bola.
 */

import { z } from "zod";
import { captchaTokenField } from "@/lib/validation";

const trimmed = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

/** `yyyy-MM-dd`. */
const dateStrSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Fecha inválida (formato esperado YYYY-MM-DD)",
  });

/** `HH:mm` 24h. */
const timeStrSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "Hora inválida (formato esperado HH:mm)",
  });

const contactSchema = z.object({
  name: trimmed(1, 120),
  email: z.string().trim().toLowerCase().email(),
  phone: trimmed(6, 30),
});

/**
 * Payload aceptado por `POST /api/reservations`.
 *  - Socio logueado: `contact` puede omitirse → se usa el del perfil.
 *  - Guest: `contact` es obligatorio.
 * Validación exacta se hace en el handler (depende del requester).
 */
const menuLineSchema = z.object({
  offerId: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(0).max(500),
  /** Un principal por ración de ese menú; obligatorio vía lógica de negocio si el menú tiene opciones. */
  mainPicks: z.array(z.string().max(200)).max(50).optional(),
});

export const createReservationSchema = z.object({
  reservationDate: dateStrSchema,
  reservationTime: timeStrSchema,
  partySize: z.coerce.number().int().min(1).max(50),
  notes: trimmed(0, 1000).optional().or(z.literal("")),
  contact: contactSchema.optional(),
  /** Cantidades por menú; con ofertas activas, en servidor la suma debe ser partySize. */
  menuLines: z.array(menuLineSchema).default([]),
  /** Captcha solo lo envían los guests (logueados ya pasaron el de login). */
  captchaToken: captchaTokenField,
});

export type CreateReservationPayload = z.infer<
  typeof createReservationSchema
>;

export const reservationMessageSchema = z.object({
  body: trimmed(1, 2000),
  /** Referencias a documentos adjuntos (menús, carta…). */
  documentIds: z.array(z.string().min(1).max(100)).max(10).optional(),
});

export const reservationCancelSchema = z
  .object({
    reason: trimmed(0, 500).optional(),
  })
  .optional();

export const reservationAcceptSchema = z.object({}).optional();

export const slotsQuerySchema = z.object({
  date: dateStrSchema,
});

export const guestMagicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  captchaToken: captchaTokenField,
});

/** Payload de `POST /api/reservations/guest/otp/request`. */
export const guestOtpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  captchaToken: captchaTokenField,
});

/** Payload de `POST /api/reservations/guest/otp/verify`. */
export const guestOtpVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: "Código inválido" }),
  captchaToken: captchaTokenField,
});

// ─── Admin ────────────────────────────────────────────────────────────

const reservationStatusSchema = z.enum([
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
  "cancelled_by_customer",
  "cancelled_by_staff",
  "no_show",
  "completed",
]);

/** `POST /admin/reservations/:id/status` */
export const adminReservationStatusSchema = z.object({
  newStatus: reservationStatusSchema,
  expectedVersion: z.coerce.number().int().nonnegative(),
  systemMessage: trimmed(0, 2000).optional().or(z.literal("")),
  markPrepaymentReceived: z.boolean().optional(),
  invalidateGuestSession: z.boolean().optional(),
});

/** `POST /admin/reservations/:id/schedule` */
export const adminReservationScheduleSchema = z.object({
  reservationDate: dateStrSchema,
  reservationTime: timeStrSchema,
  expectedVersion: z.coerce.number().int().nonnegative(),
  systemMessage: trimmed(0, 2000).optional().or(z.literal("")),
});

/**
 * `POST /admin/reservations/:id/details` — contacto + comensales + fecha/hora.
 *
 * `menuLines` opcional: si llega, el endpoint reescribe en la misma
 * transacción el reparto de menús junto al resto de campos. Sirve para
 * resolver el bloqueo cruzado entre comensales y menús (no se podía
 * cambiar uno sin el otro porque cada validación bloqueaba al otro).
 */
export const adminReservationDetailsSchema = z.object({
  contact: contactSchema,
  partySize: z.coerce.number().int().min(1).max(50),
  reservationDate: dateStrSchema,
  reservationTime: timeStrSchema,
  expectedVersion: z.coerce.number().int().nonnegative(),
  systemMessage: trimmed(0, 2000).optional().or(z.literal("")),
  menuLines: z.array(menuLineSchema).optional(),
});

/** `POST /api/admin/reservations/:id/table` — etiqueta de mesa (texto libre). */
export const adminReservationTableSchema = z.object({
  tableLabel: trimmed(0, 32).optional().or(z.literal("")),
  expectedVersion: z.coerce.number().int().nonnegative(),
});

/** `POST /admin/reservations/:id/messages` */
export const adminReservationMessageSchema = z.object({
  body: trimmed(1, 2000),
  documentIds: z.array(z.string().min(1).max(100)).max(10).optional(),
});

/** `POST /admin/reservations/:id/notes` */
export const adminReservationNoteSchema = z.object({
  body: trimmed(1, 2000),
});

/** `POST /admin/reservations/:id/prepayment` (cuerpo JSON: solo reembolso) */
export const adminReservationPrepaymentSchema = z.object({
  action: z.literal("mark_refunded"),
  expectedVersion: z.coerce.number().int().nonnegative(),
});

// ─── Config ─────────────────────────────────────────────────────────────

const hhMmSchema = timeStrSchema;

const slotWindowSchema = z.object({
  from: hhMmSchema,
  to: hhMmSchema,
  stepMinutes: z.coerce.number().int().min(5).max(240),
  capacity: z.coerce.number().int().min(0).max(1000),
});

const slotDaySchema = z.object({
  windows: z.array(slotWindowSchema).max(10),
});

const weekdayKey = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const optionalBookableDate = z
  .union([dateStrSchema, z.literal("")])
  .optional()
  .default("");

export const adminSlotsConfigSchema = z
  .object({
    timezone: z.string().trim().min(1).max(60),
    advanceMinMinutes: z.coerce.number().int().min(0).max(24 * 60 * 30),
    advanceMaxDays: z.coerce.number().int().min(1).max(365),
    minPartySize: z.coerce.number().int().min(1).max(500),
    maxPartySize: z.coerce.number().int().min(1).max(500),
    byWeekday: z.record(weekdayKey, slotDaySchema),
    exceptions: z
      .record(dateStrSchema, slotDaySchema)
      .optional()
      .default({}),
    bookableFromDate: optionalBookableDate,
    bookableUntilDate: optionalBookableDate,
  })
  .superRefine((data, ctx) => {
    const from = data.bookableFromDate?.trim() || "";
    const until = data.bookableUntilDate?.trim() || "";
    if (from && until && from > until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "La fecha inicio del rango debe ser anterior o igual a la de fin",
        path: ["bookableUntilDate"],
      });
    }
  });

export const adminPrepaymentConfigSchema = z.object({
  enabled: z.boolean(),
  minPartySize: z.coerce.number().int().min(1).max(500),
  amountPerPersonCents: z.coerce.number().int().min(0).max(1_000_000),
  deadlineHours: z.coerce.number().int().min(1).max(24 * 30),
  instructionsTemplate: trimmed(1, 5000),
});

/** Fecha ISO opcional (trim a undefined si está vacía). */
const optionalIsoDeadline = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return undefined;
    const t = v.trim();
    return t === "" ? undefined : t;
  })
  .refine(
    (v) => v === undefined || !Number.isNaN(Date.parse(v)),
    { message: "La fecha/hora debe ser ISO 8601 válida" },
  );

/** `PUT /api/admin/reservations/config/access-gates` */
export const adminAccessGatesConfigSchema = z.object({
  carnetPurchaseDeadlineIso: optionalIsoDeadline,
  tableReservationDeadlineIso: optionalIsoDeadline,
  loginDeadlineIso: optionalIsoDeadline,
});

/** @deprecated Alias retrocompatible. */
export const adminCarnetPurchaseConfigSchema = adminAccessGatesConfigSchema.pick({
  carnetPurchaseDeadlineIso: true,
});

const reservationMenuOfferSchema = z.object({
  offerId: z.string().trim().min(1).max(80),
  name: trimmed(1, 200),
  priceCents: z.coerce.number().int().min(0).max(1_000_000),
  /** Hasta 4 textos; se normalizan a 4 entradas al guardar. */
  mainCourses: z.array(z.string().max(200)).max(4).optional().default([]),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9_999),
  imageS3Key: z.string().max(500).optional(),
  imageContentType: z.string().max(100).optional(),
});

export const adminMenusConfigSchema = z.object({
  offers: z.array(reservationMenuOfferSchema).max(50),
});

/** `POST /api/admin/reservations/:id/menus` */
export const adminReservationMenusSchema = z.object({
  menuLines: z.array(menuLineSchema).min(1),
  expectedVersion: z.coerce.number().int().nonnegative(),
  systemMessage: trimmed(0, 2000).optional().or(z.literal("")),
});
