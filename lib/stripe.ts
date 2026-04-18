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
 * Construye la URL del Payment Link de Stripe añadiendo los parámetros
 * necesarios para que, tras el pago, el webhook pueda localizar al usuario:
 *  - `client_reference_id`: id interno del usuario/preregistro.
 *  - `prefilled_email`: email del socio (opcional pero mejora UX).
 *
 * El producto, precio y success_url se configuran en el dashboard de Stripe.
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
