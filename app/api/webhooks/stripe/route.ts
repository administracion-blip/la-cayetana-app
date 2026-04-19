import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Webhook de Stripe en modo LOG-ONLY.
 *
 * Flujo actual (MANUAL): la activación de socios NO depende de este webhook.
 * El admin valida el pago y activa al usuario desde `/admin/users`.
 *
 * Este endpoint se mantiene únicamente para registrar eventos en el servidor
 * (útil para depurar o auditar) y para no romper integraciones de Stripe si
 * la URL estaba configurada en el dashboard. `STRIPE_WEBHOOK_SECRET` es
 * opcional: si no está definida, los eventos se ignoran sin error.
 *
 * TODO: cuando se quiera volver al flujo automático, restaurar la llamada a
 * `activateUserFromCheckoutSession(session)` dentro de `checkout.session.completed`.
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.info(
      "[stripe webhook] recibido pero STRIPE_WEBHOOK_SECRET no está configurado; ignorado.",
    );
    return NextResponse.json({ received: true, handled: false });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Sin firma" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const raw = await request.text();
    const event = stripe.webhooks.constructEvent(raw, sig, secret);
    console.info("[stripe webhook] evento recibido", event.type, event.id);
    return NextResponse.json({ received: true, handled: false });
  } catch (e) {
    console.error("[stripe webhook] firma inválida o error", e);
    return NextResponse.json({ error: "Webhook inválido" }, { status: 400 });
  }
}
