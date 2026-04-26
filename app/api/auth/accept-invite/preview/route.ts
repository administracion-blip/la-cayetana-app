import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invite-token";
import {
  getMemberInvite,
  isMemberInviteExpired,
} from "@/lib/repositories/member-invites";

/**
 * `GET /api/auth/accept-invite/preview?token=…`
 *
 * Devuelve los datos no sensibles asociados a la invitación (email y, si los
 * adjuntó el admin, nombre y teléfono) para precargar el formulario público.
 * No revela quién invitó.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token || token.length < 32) {
    return NextResponse.json(
      { error: "Token de invitación no válido" },
      { status: 400 },
    );
  }

  const tokenHash = hashInviteToken(token);
  const invite = await getMemberInvite(tokenHash);
  if (!invite || isMemberInviteExpired(invite)) {
    return NextResponse.json(
      { error: "El enlace ha caducado o no es válido" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    email: invite.email,
    name: invite.name ?? "",
    phone: invite.phone ?? "",
    expiresAt: invite.expiresAt,
  });
}
