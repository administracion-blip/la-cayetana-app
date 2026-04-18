import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  try {
    const env = getEnv();
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/?canceled=1`,
    });
    if (!session.url) {
      return NextResponse.json(
        { error: "No se pudo crear la sesión de pago" },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Error al iniciar el pago" },
      { status: 500 },
    );
  }
}
