import { NextRequest, NextResponse } from "next/server";
import {
  checkoutSessionPayerEmail,
  checkoutSessionPayerName,
} from "@/lib/stripe-checkout";
import { getStripe } from "@/lib/stripe";
import { upsertPaidSessionRecord } from "@/lib/repositories/paid-session";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json(
        { error: "Falta session_id" },
        { status: 400 },
      );
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid";
    const payerEmail = checkoutSessionPayerEmail(session);
    const payerName = checkoutSessionPayerName(session);

    if (paid) {
      await upsertPaidSessionRecord({
        stripeSessionId: session.id,
        payerEmail,
        payerName,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency?.toUpperCase() ?? null,
      });
    }

    return NextResponse.json({
      paid,
      paymentStatus: session.payment_status,
      sessionId: session.id,
      prefillEmail: payerEmail ?? "",
      prefillName: payerName ?? "",
      /** Si Stripe aportó email, el formulario debe usar el mismo (también validado en /api/auth/activate). */
      emailFromStripe: Boolean(payerEmail),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo verificar el pago" },
      { status: 500 },
    );
  }
}
