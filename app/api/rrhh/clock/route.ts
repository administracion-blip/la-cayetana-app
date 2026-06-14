import { NextResponse } from "next/server";
import { requireWorkerForApi } from "@/lib/auth/admin";
import { computeJornadaDate } from "@/lib/datetime";
import { verifyTerminalToken } from "@/lib/rrhh/clock-token";
import { settleClockIfExpired } from "@/lib/rrhh/clock-settle";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";
import {
  closeClockOut,
  createClockIn,
  getLatestClockForWorker,
  getRrhhConfig,
} from "@/lib/repositories/rrhh";

const LOG = "[rrhh/clock]";

/**
 * `POST /api/rrhh/clock`
 *
 * Ficha entrada o salida del trabajador autenticado. Requiere el token del
 * QR del terminal (presencia física reciente). Determina automáticamente si
 * es entrada o salida según el último fichaje; en la salida admite un
 * comentario de incidencia.
 */
export async function POST(req: Request) {
  const guard = await requireWorkerForApi();
  if (!guard.ok) return guard.response;

  const ip = extractClientIp(req);
  const rl = await applyRateLimits(
    req,
    [{ key: `rrhh:clock:${guard.user.id}:${ip}`, windowMs: 60 * 1000, max: 6 }],
    { route: "rrhh/clock" },
  );
  if (!rl.ok) return rl.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (json ?? {}) as { token?: unknown; comment?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const comment =
    typeof body.comment === "string"
      ? body.comment.trim().slice(0, 300)
      : undefined;

  if (!(await verifyTerminalToken(token))) {
    return NextResponse.json(
      { error: "El código ha caducado. Vuelve a escanear el QR del terminal." },
      { status: 400 },
    );
  }

  try {
    const config = await getRrhhConfig();
    const now = new Date();
    const nowIso = now.toISOString();

    const rawLatest = await getLatestClockForWorker(guard.user.id);
    // Si el último turno quedó abierto y su jornada ya terminó, se cierra
    // automáticamente (salida no gestionada) y este fichaje será una entrada.
    const latest = rawLatest
      ? await settleClockIfExpired(rawLatest, now, {
          jornadaStartHour: config.jornadaStartHour,
          timezone: config.timezone,
        })
      : null;

    if (latest && !latest.clockOutAt) {
      const closed = await closeClockOut({
        userId: guard.user.id,
        clockInAt: latest.clockInAt,
        clockId: latest.clockId,
        clockOutAt: nowIso,
        comment,
      });
      return NextResponse.json({
        ok: true,
        action: "out",
        at: closed.clockOutAt,
      });
    }

    const jornadaDate = computeJornadaDate(
      now,
      config.jornadaStartHour,
      config.timezone,
    );
    const created = await createClockIn({
      userId: guard.user.id,
      workerNameSnapshot: guard.user.name,
      clockInAt: nowIso,
      jornadaDate,
    });
    return NextResponse.json({
      ok: true,
      action: "in",
      at: created.clockInAt,
    });
  } catch (e) {
    const name =
      e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        { error: "Tu fichaje cambió mientras tanto. Inténtalo de nuevo." },
        { status: 409 },
      );
    }
    console.error(`${LOG} error`, e);
    return NextResponse.json(
      { error: "No se pudo registrar el fichaje" },
      { status: 500 },
    );
  }
}
