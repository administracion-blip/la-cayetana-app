import { z } from "zod";

const schema = z.object({
  AWS_REGION: z.string().min(1),
  USERS_TABLE_NAME: z.string().min(1),
  POSTS_TABLE_NAME: z.string().min(1),
  /** Tabla DynamoDB para la programación/eventos del feed. */
  PROGRAMACION_TABLE_NAME: z.string().min(1),
  /** Bucket S3 donde se guardan las imágenes de los eventos. */
  PROGRAMACION_S3_BUCKET: z.string().min(1),
  /**
   * Tabla DynamoDB single-table de la Ruleta de la Suerte.
   * PK/SK: `PK` + `SK` (String). GSIs:
   *  - `by-user-prize` (GSI1PK + GSI1SK)
   *  - `by-prize-status` (GSI2PK + GSI2SK)
   */
  ROULETTE_TABLE_NAME: z.string().min(1),
  /**
   * Tabla DynamoDB single-table del módulo de Reservas (RESERVATION, MESSAGE,
   * EVENT, NOTE, GUEST, DOCUMENT, CONFIG). PK/SK string. GSIs esperadas:
   *  - `by-status-date`  (GSI1PK + GSI1SK)   · listado por estado + fecha
   *  - `by-date`         (GSI2PK + GSI2SK)   · listado por día concreto
   *  - `by-customer`     (GSI3PK + GSI3SK)   · reservas por userId / guestId
   *  - `by-email`        (GSI4PK + GSI4SK)   · lookup por email (guest + recur.)
   *
   * Opcional hasta que el módulo de reservas se cablee en PR2. Los repos que
   * la usen deben llamar a `requireReservationsEnv()` para obtener un error
   * claro si falta.
   */
  RESERVATIONS_TABLE_NAME: z.string().min(1).optional(),
  /**
   * Bucket S3 privado donde viven los PDFs de carta, menús, bebidas y
   * condiciones del módulo de reservas. Se sirve a través de un proxy
   * `/api/reservations/documents/[id]/file`, nunca como URL pública.
   *
   * Opcional hasta PR2 (ver `RESERVATIONS_TABLE_NAME`).
   */
  RESERVATION_DOCS_S3_BUCKET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1),
  /**
   * Secreto del webhook de Stripe. OPCIONAL en el flujo manual actual:
   * la activación de socios no depende del webhook. Si está vacío o ausente,
   * `/api/webhooks/stripe` ignora los eventos (log-only). Si se vuelve al
   * flujo automático habrá que rellenarlo.
   */
  STRIPE_WEBHOOK_SECRET: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  /**
   * Stripe Payment Link estático (se configura producto y precio en el dashboard).
   * Ejemplo: https://buy.stripe.com/xxxxxxxx. El backend le añade
   * client_reference_id y prefilled_email por query string.
   */
  NEXT_PUBLIC_STRIPE_PAYMENT_LINK: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://buy.stripe.com/"), {
      message: "Debe ser un Payment Link de Stripe (https://buy.stripe.com/...)",
    }),
  SESSION_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  /** Email verificado en SES (From). Vacío o ausente = sin envío (solo log del enlace en servidor). */
  SES_FROM_EMAIL: z
    .union([z.string().email(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  /**
   * Destinatario de los avisos de nueva reserva (staff). Puede ser una
   * lista separada por comas. Si está vacío o ausente, solo se loggea.
   * Ejemplo: `reservas@lacayetana.com,maria@lacayetana.com`.
   */
  RESERVATIONS_STAFF_ALERT_EMAIL: z
    .union([z.string().min(3), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  /**
   * Fecha y hora límite (ISO 8601, p. ej. `2026-05-31T23:59:59.000Z`) tras la cual
   * no se permite iniciar nuevas altas / compra del carnet desde la web. Si está
   * definida, tiene prioridad sobre Dynamo (`CONFIG`/`CARNET`). Vacía o ausente =
   * usar la fecha guardada en administración (o sin límite si tampoco hay).
   */
  FECHA_LIMITE_COMPRA_CARNET: z
    .union([z.string(), z.undefined()])
    .transform((v) =>
      v === undefined || typeof v !== "string" || v.trim() === ""
        ? undefined
        : v.trim(),
    )
    .refine(
      (v) => v === undefined || !Number.isNaN(Date.parse(v)),
      {
        message:
          "FECHA_LIMITE_COMPRA_CARNET debe ser una fecha/hora ISO 8601 válida",
      },
    ),
  /**
   * Cloudflare Turnstile — protección anti-bot en formularios públicos
   * (registro, login, forgot, reset, alta de reserva, accept-invite).
   *
   * Site key: pública, se inyecta en el cliente (`NEXT_PUBLIC_*`).
   * Secret key: privada, se usa server-side para validar el token.
   *
   * Si AMBAS están vacías el captcha se desactiva globalmente (modo dev /
   * fallback). Si solo falta una, se considera mal configurado y el
   * verificador se loggea pero deja pasar (fail-open) para no romper la
   * web por un despliegue a medias.
   */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  TURNSTILE_SECRET_KEY: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  /**
   * Backend del rate limiter. `memory` (default): contador por proceso,
   * útil en dev. `dynamo`: persistente y compartido entre réplicas
   * (recomendado en producción). Ver `lib/rate-limit.ts`.
   */
  RATE_LIMIT_BACKEND: z
    .union([z.literal("memory"), z.literal("dynamo"), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? "memory" : v)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Variables de entorno inválidas: ${JSON.stringify(msg)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Devuelve las envs del módulo de Reservas o lanza un error claro si no
 * están definidas. Usar desde repos/routes de reservas para no depender
 * del `throw` genérico de Zod.
 */
export function requireReservationsEnv(): {
  RESERVATIONS_TABLE_NAME: string;
  RESERVATION_DOCS_S3_BUCKET: string;
} {
  const env = getEnv();
  if (!env.RESERVATIONS_TABLE_NAME || !env.RESERVATION_DOCS_S3_BUCKET) {
    throw new Error(
      "El módulo de Reservas no está configurado: define RESERVATIONS_TABLE_NAME y RESERVATION_DOCS_S3_BUCKET en tu entorno.",
    );
  }
  return {
    RESERVATIONS_TABLE_NAME: env.RESERVATIONS_TABLE_NAME,
    RESERVATION_DOCS_S3_BUCKET: env.RESERVATION_DOCS_S3_BUCKET,
  };
}
