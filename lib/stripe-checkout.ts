import type Stripe from "stripe";
import { normalizeEmail } from "@/lib/constants";

export function checkoutSessionPayerEmail(
  session: Stripe.Checkout.Session,
): string | null {
  const raw =
    session.customer_details?.email ?? session.customer_email ?? null;
  if (!raw || typeof raw !== "string") return null;
  return normalizeEmail(raw);
}

export function checkoutSessionPayerName(
  session: Stripe.Checkout.Session,
): string | null {
  const n = session.customer_details?.name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}
