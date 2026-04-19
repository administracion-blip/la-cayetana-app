import { z } from "zod";

const schema = z.object({
  AWS_REGION: z.string().min(1),
  USERS_TABLE_NAME: z.string().min(1),
  POSTS_TABLE_NAME: z.string().min(1),
  /** Tabla DynamoDB para la programación/eventos del feed. */
  PROGRAMACION_TABLE_NAME: z.string().min(1),
  /** Bucket S3 donde se guardan las imágenes de los eventos. */
  PROGRAMACION_S3_BUCKET: z.string().min(1),
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
