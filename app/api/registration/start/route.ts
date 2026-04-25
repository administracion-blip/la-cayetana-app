import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { isCarnetPurchaseClosed } from "@/lib/carnet-purchase-deadline";
import { getEnv } from "@/lib/env";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
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

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

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
    // Rate-limit antes incluso de parsear el JSON: 6 intentos por IP cada
    // 10 minutos. Frena spam de altas y enumeración masiva de emails sin
    // afectar a usuarios reales que se equivocan al rellenar el form.
    try {
      await enforceRateLimit({
        key: `auth:registration:ip:${extractClientIp(request)}`,
        windowMs: 10 * 60 * 1000,
        max: 6,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          {
            error:
              "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
          },
          {
            status: 429,
            headers: { "Retry-After": String(err.retryAfterSec) },
          },
        );
      }
      throw err;
    }

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

    if (await isCarnetPurchaseClosed()) {
      return NextResponse.json(
        {
          error:
            "El plazo para conseguir el carnet en línea ha finalizado. Si necesitas ayuda, contacta a través de lacayetanagranada@gmail.com.",
        },
        { status: 403 },
      );
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
      // Unificamos las dos respuestas 409 ("cuenta activa" vs "draft
      // pendiente") en un único mensaje neutral. Antes el copy permitía
      // enumerar el estado del email (activo vs draft); ahora un atacante
      // que pruebe emails sólo distingue 200 (no existe) de 409 (existe
      // en algún estado), con el mismo coste de respuesta.
      //
      // El usuario legítimo sigue teniendo una salida clara: si recuerda
      // la contraseña entra; si no, recupera. En el caso de un draft
      // pending_payment, "recuperar contraseña" también funciona porque
      // `createPendingUser` ya guardó el `passwordHash`.
      if (
        err instanceof EmailAlreadyActiveError ||
        err instanceof PendingRegistrationExistsError
      ) {
        return NextResponse.json(
          {
            error:
              "Ya hay un registro asociado a ese email. Si es tuyo, inicia sesión o usa la opción de recuperar contraseña.",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({ url: paymentLink, userId: user.id });
  } catch (e) {
    // Solo el mensaje: evita volcar stacks completos con metadatos de la
    // petición (datos del formulario, hashes parciales, etc.) en logs.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[registration][start] error: ${msg}`);
    return NextResponse.json(
      { error: "No se pudo iniciar el registro" },
      { status: 500 },
    );
  }
}
