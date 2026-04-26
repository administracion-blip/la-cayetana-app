import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { isCarnetPurchaseClosed } from "@/lib/carnet-purchase-deadline";
import { normalizeEmail } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { verifyCaptcha } from "@/lib/security/captcha";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";
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
    // Primer freno: 6 intentos por IP cada 10 min. Frena spam masivo
    // (un atacante con 1 IP no puede iterar emails sin descanso).
    const ip = extractClientIp(request);
    const ipLimit = await applyRateLimits(
      request,
      [
        {
          key: `auth:registration:ip:${ip}`,
          windowMs: 10 * 60 * 1000,
          max: 6,
        },
      ],
      { route: "registration/start" },
    );
    if (!ipLimit.ok) return ipLimit.response;

    const json = await request.json();
    const parsed = registrationStartSchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: firstIssue ?? "Revisa los datos del formulario" },
        { status: 400 },
      );
    }

    const { name, email, phone, sex, birthYear, password, captchaToken } =
      parsed.data;
    const { NEXT_PUBLIC_STRIPE_PAYMENT_LINK: paymentLink } = getEnv();

    // Verificación anti-bot (Turnstile). Si el captcha está desactivado
    // por env, devuelve `{ ok: true, mode: "disabled" }` sin gastar red.
    const captcha = await verifyCaptcha(captchaToken, request);
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 });
    }

    // Segundo freno: 3 intentos por email cada 10 min. Bloquea ataques
    // distribuidos (muchas IPs apuntando al mismo correo) y enumeración
    // dirigida. Va después de la validación del schema para no penalizar
    // payloads ilegibles que ni siquiera traen un email válido.
    const emailNormalized = normalizeEmail(email);
    const emailLimit = await applyRateLimits(
      request,
      [
        {
          key: `auth:registration:email:${emailNormalized}`,
          windowMs: 10 * 60 * 1000,
          max: 3,
        },
      ],
      { route: "registration/start" },
    );
    if (!emailLimit.ok) return emailLimit.response;

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
