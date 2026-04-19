import Stripe from "stripe";
import { getEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const { STRIPE_SECRET_KEY } = getEnv();
  stripe = new Stripe(STRIPE_SECRET_KEY, { typescript: true });
  return stripe;
}

/**
 * [INACTIVO EN EL FLUJO MANUAL]
 *
 * Construye la URL del Payment Link añadiendo `client_reference_id` y
 * `prefilled_email` para que un webhook pueda ligar el pago al preregistro.
 *
 * Hoy no se usa: en el flujo manual el frontend redirige directamente a
 * `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` sin parámetros y la activación la hace
 * el admin desde `/admin/users`. Se mantiene como utilidad lista para
 * cuando se reactive el flujo automático.
 */
export function buildStripePaymentLinkUrl(params: {
  userId: string;
  email?: string;
}): string {
  const { NEXT_PUBLIC_STRIPE_PAYMENT_LINK } = getEnv();
  const url = new URL(NEXT_PUBLIC_STRIPE_PAYMENT_LINK);
  url.searchParams.set("client_reference_id", params.userId);
  if (params.email) {
    url.searchParams.set("prefilled_email", params.email);
  }
  return url.toString();
}
