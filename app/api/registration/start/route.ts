import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import {
  canRenewThisYear,
  createPendingUser,
  EmailAlreadyActiveError,
  getUserByEmail,
  PendingRegistrationExistsError,
  prepareRenewal,
  UserAlreadyPaidThisYearError,
} from "@/lib/repositories/users";
import { buildStripePaymentLinkUrl } from "@/lib/stripe";
import { registrationStartSchema } from "@/lib/validation";

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

    // Detectamos si el email pertenece ya a un socio (renovación) o si es un
    // alta nueva. Los preregistros `pending_payment` siguen el flujo estándar.
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

      const url = buildStripePaymentLinkUrl({
        userId: existing.id,
        email: existing.email,
      });

      return NextResponse.json({
        url,
        userId: existing.id,
        renewal: true,
        membershipId: existing.membershipId ?? null,
      });
    }

    // Alta nueva.
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

    const url = buildStripePaymentLinkUrl({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({ url, userId: user.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo iniciar el registro" },
      { status: 500 },
    );
  }
}
