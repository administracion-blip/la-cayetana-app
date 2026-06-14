import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { hashPassword } from "@/lib/auth/password";
import { verifyCaptcha } from "@/lib/security/captcha";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";
import {
  createWorkerProfile,
  deleteWorkerInvite,
  getWorkerInvite,
  isWorkerInviteExpired,
  markWorkerInviteConsumed,
} from "@/lib/repositories/rrhh";
import {
  createInvitedUser,
  EmailAlreadyActiveError,
  PendingRegistrationExistsError,
} from "@/lib/repositories/users";
import { workerOnboardingSchema } from "@/lib/validation-rrhh";

const LOG = "[rrhh/onboarding]";

/**
 * `POST /api/rrhh/onboarding`
 *
 * Alta de trabajador desde el enlace de invitación: crea la cuenta de socio
 * con `isWorker: true` y persiste la ficha laboral con datos sensibles en la
 * tabla de RRHH. No registra los datos sensibles en logs.
 */
export async function POST(request: Request) {
  try {
    const ip = extractClientIp(request);
    const ipLimit = await applyRateLimits(
      request,
      [{ key: `rrhh:onboarding:ip:${ip}`, windowMs: 10 * 60 * 1000, max: 10 }],
      { route: "rrhh/onboarding" },
    );
    if (!ipLimit.ok) return ipLimit.response;

    const json = await request.json();
    const parsed = workerOnboardingSchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: firstIssue ?? "Revisa los datos del formulario" },
        { status: 400 },
      );
    }

    const {
      token,
      name,
      phone,
      sex,
      birthYear,
      password,
      dni,
      socialSecurityNumber,
      iban,
      address,
      city,
      postalCode,
      captchaToken,
    } = parsed.data;

    const captcha = await verifyCaptcha(captchaToken, request);
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);

    const tokenLimit = await applyRateLimits(
      request,
      [
        {
          key: `rrhh:onboarding:token:${tokenHash}`,
          windowMs: 10 * 60 * 1000,
          max: 5,
        },
      ],
      { route: "rrhh/onboarding" },
    );
    if (!tokenLimit.ok) return tokenLimit.response;

    const invite = await getWorkerInvite(tokenHash);
    if (!invite || isWorkerInviteExpired(invite)) {
      return NextResponse.json(
        {
          error:
            "El enlace ha caducado o no es válido. Pide a RRHH que te envíe uno nuevo.",
        },
        { status: 400 },
      );
    }
    if (invite.consumedUserId) {
      return NextResponse.json(
        {
          error:
            "Tu alta ya está completada. Inicia sesión o sube tus documentos desde el mismo enlace.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await createInvitedUser({
        email: invite.email,
        name,
        passwordHash,
        phone,
        sex,
        birthYear,
        invitedByUserId: invite.invitedByUserId,
        asWorker: true,
      });
    } catch (err) {
      if (err instanceof EmailAlreadyActiveError) {
        await deleteWorkerInvite(tokenHash);
        return NextResponse.json(
          {
            error:
              "Ya existe una cuenta con este email. Si eres tú, inicia sesión o recupera tu contraseña.",
          },
          { status: 409 },
        );
      }
      if (err instanceof PendingRegistrationExistsError) {
        return NextResponse.json(
          {
            error:
              "Hay un alta pendiente con este email. Avísanos para resolverlo.",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    try {
      await createWorkerProfile({
        userId: user.id,
        nameSnapshot: name,
        emailSnapshot: invite.email,
        dni,
        socialSecurityNumber,
        iban,
        address,
        city,
        postalCode,
      });
    } catch (err) {
      // La cuenta ya quedó creada; registramos el fallo de la ficha sin
      // volcar datos sensibles para que RRHH pueda completarla a mano.
      console.error(`${LOG} worker profile save failed userId=${user.id}`);
      throw err;
    }

    // No borramos la invitación: la marcamos consumida para que el trabajador
    // pueda subir su DNI desde el mismo enlace hasta que caduque por TTL.
    await markWorkerInviteConsumed(tokenHash, user.id);

    return NextResponse.json({
      ok: true,
      membershipId: user.membershipId ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} error: ${msg}`);
    return NextResponse.json(
      { error: "No se pudo completar el alta" },
      { status: 500 },
    );
  }
}
