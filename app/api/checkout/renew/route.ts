import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  canRenewThisYear,
  getUserById,
  prepareRenewal,
} from "@/lib/repositories/users";
import { buildStripePaymentLinkUrl } from "@/lib/stripe";

/**
 * Inicia la renovación de un socio logueado. Mantiene el mismo `membershipId`
 * y `userId`, y devuelve la URL del Payment Link de Stripe para completar el
 * pago. La activación posterior se realiza vía webhook (checkout.session.completed).
 */
export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const user = await getUserById(session.sub);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (user.status === "pending_payment") {
      return NextResponse.json(
        { error: "Completa tu alta antes de renovar." },
        { status: 400 },
      );
    }
    if (!canRenewThisYear(user)) {
      return NextResponse.json(
        { error: "Tu bono de este año ya está pagado." },
        { status: 409 },
      );
    }

    // No se actualizan datos de perfil ni contraseña desde /app: solo renovación.
    await prepareRenewal({ userId: user.id });

    const url = buildStripePaymentLinkUrl({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({ url });
  } catch (e) {
    console.error("[checkout/renew]", e);
    return NextResponse.json(
      { error: "No se pudo iniciar la renovación" },
      { status: 500 },
    );
  }
}
