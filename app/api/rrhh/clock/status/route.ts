import { NextResponse } from "next/server";
import { requireWorkerForApi } from "@/lib/auth/admin";
import { verifyTerminalToken } from "@/lib/rrhh/clock-token";
import { settleClockIfExpired } from "@/lib/rrhh/clock-settle";
import {
  getLatestClockForWorker,
  getRrhhConfig,
} from "@/lib/repositories/rrhh";

export const dynamic = "force-dynamic";

/**
 * `GET /api/rrhh/clock/status?t=<token>`
 *
 * Estado de fichaje del trabajador autenticado y validez del QR escaneado.
 * Permite a la pantalla `/fichar` mostrar el botón correcto (entrada/salida).
 */
export async function GET(req: Request) {
  const guard = await requireWorkerForApi();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const tokenValid = token ? await verifyTerminalToken(token) : false;

  const rawLatest = await getLatestClockForWorker(guard.user.id);
  let latest = rawLatest;
  if (rawLatest && !rawLatest.clockOutAt) {
    const config = await getRrhhConfig();
    latest = await settleClockIfExpired(rawLatest, new Date(), {
      jornadaStartHour: config.jornadaStartHour,
      timezone: config.timezone,
    });
  }
  const open = Boolean(latest && !latest.clockOutAt);

  return NextResponse.json({
    ok: true,
    workerName: guard.user.name,
    tokenValid,
    open,
    lastClockInAt: open ? (latest?.clockInAt ?? null) : null,
  });
}
