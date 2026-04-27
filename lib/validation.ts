import { z } from "zod";

/** Año actual evaluado al cargar el módulo (suficiente para validar alta). */
const CURRENT_YEAR = new Date().getUTCFullYear();
/** Mayoría de edad (18 años cumplidos como muy tarde este año). */
export const MAX_BIRTH_YEAR = CURRENT_YEAR - 18;
/** Límite superior de edad (100 años). */
export const MIN_BIRTH_YEAR = CURRENT_YEAR - 100;

export const USER_SEX_VALUES = ["male", "female", "prefer_not_to_say"] as const;

/**
 * Token de Turnstile que envían los formularios públicos. Es opcional en
 * el schema porque el captcha se activa por env (ver `lib/security/captcha.ts`):
 * cuando está desactivado, el formulario manda `null`/`undefined` y el
 * backend ignora el campo. La verificación real ocurre en el handler.
 */
export const captchaTokenField = z
  .union([z.string().min(1).max(2048), z.null()])
  .optional();

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
    captchaToken: captchaTokenField,
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
  captchaToken: captchaTokenField,
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  captchaToken: captchaTokenField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(64).max(128),
  password: z.string().min(8).max(128),
  captchaToken: captchaTokenField,
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

/**
 * Cuerpo del POST `/api/admin/users/invite`. El admin solo aporta el email
 * y, opcionalmente, nombre y teléfono para personalizar el correo. El resto
 * de campos los rellena el invitado al aceptar la invitación.
 */
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
});

/**
 * Cuerpo del POST `/api/auth/accept-invite`. El invitado completa los datos
 * obligatorios del alta (sin Stripe) y elige una contraseña.
 */
export const acceptInviteSchema = z
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
 * Cuerpo del PATCH `/api/admin/users/:id`. Edición restringida a campos de
 * ficha (no toca permisos ni email). Usar `null` para borrar `phone`,
 * `paidAmountEuros` o `paidAt`.
 */
export const adminUserProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z
      .union([z.string().trim().min(6).max(30), z.literal(""), z.null()])
      .optional(),
    sex: z.enum(USER_SEX_VALUES).nullable().optional(),
    birthYear: z
      .union([
        z.coerce
          .number()
          .int()
          .min(MIN_BIRTH_YEAR, { message: "Año fuera de rango" })
          .max(MAX_BIRTH_YEAR, { message: "Debes ser mayor de 18 años" }),
        z.null(),
      ])
      .optional(),
    /** Importe pagado en EUROS (50 = 50,00 €). `null` borra el campo. */
    paidAmountEuros: z
      .union([z.coerce.number().nonnegative().max(100_000), z.null()])
      .optional(),
    /**
     * Fecha del pago. Aceptamos `YYYY-MM-DD` (lo más cómodo desde el form),
     * un ISO 8601 completo o `null`/`""` para borrar. La normalización a ISO
     * la hace el route handler.
     */
    paidAt: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, { message: "Fecha inválida" }),
        z.literal(""),
        z.null(),
      ])
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Indica al menos un campo a modificar",
  });

