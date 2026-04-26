import { NextResponse } from "next/server";
import {
  generateRawInviteToken,
  hashInviteToken,
} from "@/lib/auth/invite-token";
import { requireInviteSociosForApi } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/constants";
import { sendMemberInviteEmail } from "@/lib/email/member-invite-mail";
import { getEnv } from "@/lib/env";
import { saveMemberInvite } from "@/lib/repositories/member-invites";
import { getUserByEmail } from "@/lib/repositories/users";
import { inviteMemberSchema } from "@/lib/validation";

const LOG = "[admin/users/invite]";

/**
 * `POST /api/admin/users/invite`
 *
 * Envía una invitación de alta a un nuevo socio sin pasar por Stripe. La
 * cuenta se crea en estado `active` cuando el invitado acepta el enlace y
 * completa sus datos (ver {@link createInvitedUser}).
 *
 * Permiso requerido: `canInviteSocios` (o `isAdmin` legacy).
 */
export async function POST(req: Request) {
  const auth = await requireInviteSociosForApi();
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = inviteMemberSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos de invitación inválidos" },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);

  // Bloqueamos invitar a alguien que ya es socio (activo o inactivo).
  // Para drafts pending_payment dejamos pasar: el admin puede preferir
  // invitar a esa persona en vez de esperar al pago.
  const existing = await getUserByEmail(email);
  if (existing && (existing.status === "active" || existing.status === "inactive")) {
    return NextResponse.json(
      {
        error:
          "Ya existe un socio con ese email. Edita su ficha o reactívalo desde el panel.",
      },
      { status: 409 },
    );
  }

  const rawToken = generateRawInviteToken();
  const tokenHash = hashInviteToken(rawToken);

  await saveMemberInvite({
    tokenHashHex: tokenHash,
    email,
    name: parsed.data.name?.trim() || undefined,
    phone: parsed.data.phone?.trim() || undefined,
    invitedByUserId: auth.user.id,
  });

  const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/invitacion?token=${encodeURIComponent(rawToken)}`;

  const result = await sendMemberInviteEmail({
    toEmail: email,
    inviteUrl,
    inviterName: auth.user.name,
    recipientName: parsed.data.name?.trim() || undefined,
  });

  if (!result.ok) {
    if (result.mode === "log-only" && result.reason === "missing_from_email") {
      console.warn(
        `${LOG} email NOT sent (SES_FROM_EMAIL missing); invite saved invitedBy=${auth.user.id} email=${email}`,
      );
      return NextResponse.json({
        ok: true,
        emailSent: false,
        warning:
          "La invitación se ha guardado, pero no se pudo enviar el email. Configura SES o copia el enlace manualmente.",
        inviteUrl,
      });
    }
    console.error(
      `${LOG} SES send failed invitedBy=${auth.user.id} email=${email}`,
      result,
    );
    return NextResponse.json(
      { error: "No se pudo enviar el email de invitación" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
