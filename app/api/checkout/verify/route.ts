import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

/**
 * Consulta el estado de pago de una Checkout Session.
 *
 * Flujo actual (MANUAL): este endpoint YA NO activa al usuario. Solo devuelve
 * si Stripe considera la sesión pagada. La activación la hace el admin desde
 * `/admin/users` tras verificarlo en el dashboard de Stripe.
 *
 * Se mantiene por compatibilidad con la página `/success` y para que el front
 * pueda mostrar un mensaje más preciso ("Pago recibido, pendiente de validación")
 * en lugar de asumirlo.
 *
 * TODO: para volver al flujo automático, llamar aquí a
 * `activateUserFromCheckoutSession(session)` cuando `payment_status === "paid"`.
 */
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

    return NextResponse.json({
      paid: session.payment_status === "paid",
      paymentStatus: session.payment_status,
      sessionId: session.id,
      /** Siempre "pending": la activación real es manual desde el panel admin. */
      accountStatus: "pending" as const,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo verificar el pago" },
      { status: 500 },
    );
  }
}
