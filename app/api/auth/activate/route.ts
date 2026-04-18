import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/constants";
import { deletePaidSessionRecord } from "@/lib/repositories/paid-session";
import { createUserAfterPayment } from "@/lib/repositories/users";
import { checkoutSessionPayerEmail } from "@/lib/stripe-checkout";
import { getStripe } from "@/lib/stripe";
import { toPublicUser } from "@/lib/public-user";
import { activateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = activateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Revisa los datos del formulario" },
        { status: 400 },
      );
    }
    const { sessionId, name, email, password, phone } = parsed.data;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "El pago no está confirmado. Contacta con la caseta." },
        { status: 402 },
      );
    }

    const stripeEmail = checkoutSessionPayerEmail(session);
    if (stripeEmail && normalizeEmail(email) !== stripeEmail) {
      return NextResponse.json(
        {
          error:
            "El email debe ser el mismo que usaste al pagar en Stripe. Revisa el campo Email.",
        },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    try {
      const user = await createUserAfterPayment({
        name,
        email,
        passwordHash,
        phone: phone || undefined,
        stripeSessionId: sessionId,
        stripePaymentStatus: session.payment_status,
      });
      const token = await createSessionToken({
        sub: user.id,
        email: user.email,
      });
      await setSessionCookie(token);
      try {
        await deletePaidSessionRecord(sessionId);
      } catch {
        /* auditoría opcional si ya se borró */
      }
      return NextResponse.json({ user: toPublicUser(user) });
    } catch (err: unknown) {
      const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
      if (name === "TransactionCanceledException") {
        return NextResponse.json(
          {
            error:
              "Este email ya está registrado o esta sesión de pago ya se usó.",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta" },
      { status: 500 },
    );
  }
}
