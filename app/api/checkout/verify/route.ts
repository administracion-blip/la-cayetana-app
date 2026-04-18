import { NextRequest, NextResponse } from "next/server";
import { activateUserFromCheckoutSession } from "@/lib/checkout-activation";
import { getStripe } from "@/lib/stripe";

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
    let accountStatus: "active" | "pending" | "unpaid" = "unpaid";

    if (paid) {
      const user = await activateUserFromCheckoutSession(session);
      accountStatus = user?.status === "active" ? "active" : "pending";
    }

    return NextResponse.json({
      paid,
      paymentStatus: session.payment_status,
      sessionId: session.id,
      /** "active" = cuenta ya disponible; "pending" = pago OK pero activación en curso; "unpaid" = aún no pagado. */
      accountStatus,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo verificar el pago" },
      { status: 500 },
    );
  }
}
