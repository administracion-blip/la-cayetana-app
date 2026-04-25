import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Stripe envía payloads pequeños (<10 KB típicamente). 1 MB es margen amplio
 *  para frenar peticiones abusivas con cuerpo gigante. */
const MAX_WEBHOOK_BODY_BYTES = 1 * 1024 * 1024;

/**
 * Webhook de Stripe.
 *
 * Flujo actual (MANUAL): la activación de socios NO depende de este webhook.
 * El admin valida el pago y activa al usuario desde `/admin/users`.
 *
 * Este endpoint se mantiene para registrar eventos (auditoría) y para no
 * romper integraciones existentes en el dashboard. Política de firma:
 *
 *  - En **producción** `STRIPE_WEBHOOK_SECRET` es obligatorio. Si falta, el
 *    endpoint devuelve 503: preferimos que Stripe reintente a aceptar
 *    eventos sin verificar firma. Esto blinda el endpoint para cuando se
 *    restaure el flujo automático (TODO al final).
 *  - En **desarrollo** sin secret se sigue aceptando como log-only para no
 *    bloquear pruebas locales con `stripe listen`.
 *
 * TODO: cuando se quiera volver al flujo automático, restaurar la llamada a
 * `activateUserFromCheckoutSession(session)` dentro de `checkout.session.completed`.
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProduction) {
      // En prod sin secret no podemos verificar firma: rechazamos para que
      // Stripe reintente y no se procese nada con confianza falsa.
      console.error(
        "[stripe webhook] STRIPE_WEBHOOK_SECRET ausente en producción; respondiendo 503.",
      );
      return NextResponse.json(
        { error: "Webhook no configurado" },
        { status: 503 },
      );
    }
    console.info(
      "[stripe webhook] recibido pero STRIPE_WEBHOOK_SECRET no está configurado (dev); ignorado.",
    );
    return NextResponse.json({ received: true, handled: false });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Sin firma" }, { status: 400 });
  }

  // Stripe nunca declara explícitamente Content-Length pero llega; usamos el
  // límite como salvavidas frente a payload abusivo antes de leer el cuerpo.
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const n = Number(declaredLength);
    if (Number.isFinite(n) && n > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "Webhook demasiado grande" },
        { status: 413 },
      );
    }
  }

  try {
    const stripe = getStripe();
    const raw = await request.text();
    if (raw.length > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "Webhook demasiado grande" },
        { status: 413 },
      );
    }
    const event = stripe.webhooks.constructEvent(raw, sig, secret);
    console.info("[stripe webhook] evento recibido", event.type, event.id);
    return NextResponse.json({ received: true, handled: false });
  } catch (e) {
    // No volcamos el objeto completo: en algunos paths Stripe lo enriquece
    // con metadatos que no queremos en CloudWatch. Solo el mensaje.
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`[stripe webhook] firma inválida o error: ${msg}`);
    return NextResponse.json({ error: "Webhook inválido" }, { status: 400 });
  }
}
