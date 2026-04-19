import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";
import {
  canRenewThisYear,
  createPendingUser,
  EmailAlreadyActiveError,
  getUserByEmail,
  PendingRegistrationExistsError,
  prepareRenewal,
  UserAlreadyPaidThisYearError,
} from "@/lib/repositories/users";
import { registrationStartSchema } from "@/lib/validation";

/**
 * Alta o renovación desde `/registro`.
 *
 * Flujo actual (MANUAL, sin webhook): solo persistimos los datos en Dynamo
 * (draft pendiente de pago o renovación con `pendingProfile`) y devolvemos
 * la URL del Payment Link FIJO de Stripe. El admin activará la cuenta
 * manualmente desde `/admin/users` tras verificar el cobro.
 *
 * No se adjuntan parámetros a la URL de Stripe (ni `client_reference_id` ni
 * `prefilled_email`): esta información no se utiliza en el flujo manual.
 *
 * TODO: al volver al flujo automático, reañadir `buildStripePaymentLinkUrl`
 * con `userId` y `email` para poder ligar la Checkout Session al draft.
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = registrationStartSchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: firstIssue ?? "Revisa los datos del formulario" },
        { status: 400 },
      );
    }

    const { name, email, phone, sex, birthYear, password } = parsed.data;
    const { NEXT_PUBLIC_STRIPE_PAYMENT_LINK: paymentLink } = getEnv();

    const existing = await getUserByEmail(email);
    const isRenewal =
      !!existing &&
      (existing.status === "active" || existing.status === "inactive");

    if (isRenewal && existing) {
      if (!canRenewThisYear(existing)) {
        return NextResponse.json(
          {
            error:
              "Tu bono de este año ya está pagado. Inicia sesión para ver tu carnet.",
            renewal: true,
            alreadyPaid: true,
          },
          { status: 409 },
        );
      }

      const passwordHash = await hashPassword(password);
      try {
        await prepareRenewal({
          userId: existing.id,
          passwordHash,
          profile: { name, phone, sex, birthYear },
        });
      } catch (err) {
        if (err instanceof UserAlreadyPaidThisYearError) {
          return NextResponse.json(
            {
              error:
                "Tu bono de este año ya está pagado. Inicia sesión para ver tu carnet.",
              renewal: true,
              alreadyPaid: true,
            },
            { status: 409 },
          );
        }
        throw err;
      }

      return NextResponse.json({
        url: paymentLink,
        userId: existing.id,
        renewal: true,
        membershipId: existing.membershipId ?? null,
      });
    }

    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await createPendingUser({
        name,
        email,
        passwordHash,
        phone,
        sex,
        birthYear,
      });
    } catch (err) {
      if (err instanceof EmailAlreadyActiveError) {
        return NextResponse.json(
          {
            error:
              "Ya existe una cuenta activa con ese email. Inicia sesión o recupera tu contraseña.",
          },
          { status: 409 },
        );
      }
      if (err instanceof PendingRegistrationExistsError) {
        return NextResponse.json(
          {
            error:
              "Ya hay un registro pendiente de pago con ese email. Completa el pago o espera unos minutos.",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({ url: paymentLink, userId: user.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo iniciar el registro" },
      { status: 500 },
    );
  }
}
