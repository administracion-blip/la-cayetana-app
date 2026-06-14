import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import {
  signTerminalToken,
  TERMINAL_TOKEN_TTL_SEC,
} from "@/lib/rrhh/clock-token";

export const dynamic = "force-dynamic";

/**
 * `GET /api/rrhh/clock/terminal-token`
 *
 * Devuelve un token efímero para pintar el QR del terminal de fichaje. El
 * terminal lo refresca periódicamente para que el QR rote. Permiso: gestión
 * RRHH (el terminal lo abre el personal en un dispositivo del local).
 */
export async function GET() {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const token = await signTerminalToken();
  return NextResponse.json({ token, ttlSec: TERMINAL_TOKEN_TTL_SEC });
}
