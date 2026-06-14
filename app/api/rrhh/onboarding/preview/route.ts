import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invite-token";
import {
  getWorkerInvite,
  isWorkerInviteExpired,
} from "@/lib/repositories/rrhh";

/**
 * `GET /api/rrhh/onboarding/preview?token=…`
 *
 * Devuelve los datos no sensibles de la invitación (email y, si los adjuntó
 * RRHH, nombre y teléfono) para precargar el formulario público de alta.
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
  const invite = await getWorkerInvite(tokenHash);
  if (!invite || isWorkerInviteExpired(invite)) {
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
