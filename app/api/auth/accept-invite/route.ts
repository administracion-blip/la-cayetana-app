import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { hashPassword } from "@/lib/auth/password";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  deleteMemberInvite,
  getMemberInvite,
  isMemberInviteExpired,
} from "@/lib/repositories/member-invites";
import {
  createInvitedUser,
  EmailAlreadyActiveError,
  PendingRegistrationExistsError,
} from "@/lib/repositories/users";
import { acceptInviteSchema } from "@/lib/validation";

const LOG = "[auth/accept-invite]";

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * `POST /api/auth/accept-invite`
 *
 * Endpoint público que consume el invitado al rellenar el formulario en
 * `/invitacion`. Valida el token, crea el socio en estado `active` y
 * elimina la invitación.
 */
export async function POST(request: Request) {
  try {
    try {
      await enforceRateLimit({
        key: `auth:accept-invite:ip:${extractClientIp(request)}`,
        windowMs: 10 * 60 * 1000,
        max: 10,
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
    const parsed = acceptInviteSchema.safeParse(json);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: firstIssue ?? "Revisa los datos del formulario" },
        { status: 400 },
      );
    }

    const { token, name, phone, sex, birthYear, password } = parsed.data;
    const tokenHash = hashInviteToken(token);
    const invite = await getMemberInvite(tokenHash);

    if (!invite || isMemberInviteExpired(invite)) {
      return NextResponse.json(
        {
          error:
            "El enlace de invitación ha caducado o no es válido. Pide al admin que te envíe uno nuevo.",
        },
        { status: 400 },
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
      });
    } catch (err) {
      if (err instanceof EmailAlreadyActiveError) {
        await deleteMemberInvite(tokenHash);
        return NextResponse.json(
          {
            error:
              "Ya existe un socio con este email. Si eres tú, inicia sesión o usa la opción de recuperar contraseña.",
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

    await deleteMemberInvite(tokenHash);

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
