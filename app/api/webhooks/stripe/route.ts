import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { activateUserFromCheckoutSession } from "@/lib/checkout-activation";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const stripe = getStripe();
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Sin firma" }, { status: 400 });
    }
    const raw = await request.text();
    const event = stripe.webhooks.constructEvent(
      raw,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        try {
          const full = await stripe.checkout.sessions.retrieve(session.id);
          await activateUserFromCheckoutSession(full);
        } catch (e) {
          console.error("[stripe webhook] activación fallida", session.id, e);
        }
      }
      console.info(
        "[stripe] checkout.session.completed",
        session.id,
        session.payment_status,
      );
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Webhook inválido" }, { status: 400 });
  }
}
