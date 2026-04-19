import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import {
  canRenewThisYear,
  getUserById,
  prepareRenewal,
} from "@/lib/repositories/users";

/**
 * Renovación anual desde `/app`.
 *
 * Flujo actual (MANUAL): marcamos el preregistro de renovación y devolvemos
 * la URL del Payment Link FIJO de Stripe. El admin activará la renovación
 * desde `/admin/users` tras verificar el cobro.
 *
 * TODO: para volver al flujo automático, añadir `client_reference_id` al
 * enlace y re-activar el webhook/verify (ver `checkout-activation.ts`).
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

    await prepareRenewal({ userId: user.id });

    const { NEXT_PUBLIC_STRIPE_PAYMENT_LINK: paymentLink } = getEnv();
    return NextResponse.json({ url: paymentLink });
  } catch (e) {
    console.error("[checkout/renew]", e);
    return NextResponse.json(
      { error: "No se pudo iniciar la renovación" },
      { status: 500 },
    );
  }
}
