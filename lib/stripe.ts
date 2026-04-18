import Stripe from "stripe";
import { getEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const { STRIPE_SECRET_KEY } = getEnv();
  stripe = new Stripe(STRIPE_SECRET_KEY, { typescript: true });
  return stripe;
}
