import { NextResponse } from "next/server";
import {
  generateRawInviteToken,
  hashInviteToken,
} from "@/lib/auth/invite-token";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/constants";
import { sendWorkerInviteEmail } from "@/lib/email/worker-invite-mail";
import { getEnv } from "@/lib/env";
import { saveWorkerInvite } from "@/lib/repositories/rrhh";
import { getUserByEmail } from "@/lib/repositories/users";
import { inviteWorkerSchema } from "@/lib/validation-rrhh";

const LOG = "[admin/rrhh/workers/invite]";

/**
 * `POST /api/admin/rrhh/workers/invite`
 *
 * Envía una invitación de alta a un trabajador. La cuenta se crea cuando el
 * trabajador acepta el enlace y completa sus datos (ver onboarding).
 *
 * Permiso requerido: `canManageRrhh` (o `isAdmin` legacy).
 */
export async function POST(req: Request) {
  const auth = await requireRrhhManageForApi();
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = inviteWorkerSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos de invitación inválidos" },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);

  const existing = await getUserByEmail(email);
  if (
    existing &&
    (existing.status === "active" || existing.status === "inactive")
  ) {
    return NextResponse.json(
      {
        error:
          "Ya existe una cuenta con ese email. Edítala o márcala como trabajador desde el panel de socios.",
      },
      { status: 409 },
    );
  }

  const rawToken = generateRawInviteToken();
  const tokenHash = hashInviteToken(rawToken);

  await saveWorkerInvite({
    tokenHashHex: tokenHash,
    email,
    name: parsed.data.name?.trim() || undefined,
    phone: parsed.data.phone?.trim() || undefined,
    invitedByUserId: auth.user.id,
  });

  const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/rrhh/alta?token=${encodeURIComponent(rawToken)}`;

  const result = await sendWorkerInviteEmail({
    toEmail: email,
    inviteUrl,
    inviterName: auth.user.name,
    recipientName: parsed.data.name?.trim() || undefined,
  });

  if (!result.ok) {
    if (result.mode === "log-only" && result.reason === "missing_from_email") {
      console.warn(
        `${LOG} email NOT sent (SES_FROM_EMAIL missing); invite saved invitedBy=${auth.user.id}`,
      );
      return NextResponse.json({
        ok: true,
        emailSent: false,
        warning:
          "La invitación se ha guardado, pero no se pudo enviar el email. Configura SES o copia el enlace manualmente.",
        inviteUrl,
      });
    }
    console.error(`${LOG} SES send failed invitedBy=${auth.user.id}`, result);
    return NextResponse.json(
      { error: "No se pudo enviar el email de invitación" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
