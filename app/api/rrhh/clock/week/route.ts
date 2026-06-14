import { NextResponse } from "next/server";
import { requireWorkerForApi } from "@/lib/auth/admin";
import { addDays } from "@/lib/datetime";
import {
  getRrhhConfig,
  getWorkerProfile,
  listClockForWorkerRange,
  listShiftsForWorkerRange,
} from "@/lib/repositories/rrhh";
import { buildComparison } from "@/lib/rrhh/comparison";
import { settleClockIfExpired } from "@/lib/rrhh/clock-settle";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";

export const dynamic = "force-dynamic";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/rrhh/clock/week?week=YYYY-MM-DD`
 *
 * Comparativa cuadrante vs fichajes de la semana (lunes→domingo) del propio
 * trabajador autenticado. Misma forma de respuesta que la comparativa de
 * administración, pero limitada a su `userId` (tomado de la sesión, nunca del
 * cliente).
 */
export async function GET(req: Request) {
  const guard = await requireWorkerForApi();
  if (!guard.ok) return guard.response;

  const ip = extractClientIp(req);
  const rl = await applyRateLimits(
    req,
    [{ key: `rrhh:clock:week:${guard.user.id}:${ip}`, windowMs: 60 * 1000, max: 30 }],
    { route: "rrhh/clock/week" },
  );
  if (!rl.ok) return rl.response;

  const url = new URL(req.url);
  const week = url.searchParams.get("week") ?? "";
  if (!WEEK_RE.test(week)) {
    return NextResponse.json(
      { error: "Parámetro 'week' inválido (yyyy-MM-dd)" },
      { status: 400 },
    );
  }
  const weekEnd = addDays(week, 6);
  const userId = guard.user.id;

  try {
    const [profile, config] = await Promise.all([
      getWorkerProfile(userId),
      getRrhhConfig(),
    ]);
    const worker = {
      userId,
      name: profile?.nameSnapshot ?? guard.user.name,
    };

    const shiftRecords = await listShiftsForWorkerRange(userId, week, weekEnd);

    // Ventana ISO holgada para capturar fichajes cuya jornada cae en la semana
    // (incluye los que cruzan medianoche); luego filtramos por `jornadaDate`.
    const fromIso = `${addDays(week, -1)}T00:00:00.000Z`;
    const toIso = `${addDays(weekEnd, 2)}T00:00:00.000Z`;
    const daySet = new Set(Array.from({ length: 7 }, (_, i) => addDays(week, i)));
    const now = new Date();
    const rawClocks = (
      await listClockForWorkerRange(userId, fromIso, toIso)
    ).filter((c) => daySet.has(c.jornadaDate));

    // Cierre automático de turnos vencidos no gestionados (salida sin fichar).
    const clockRecords = await Promise.all(
      rawClocks.map((c) =>
        settleClockIfExpired(c, now, {
          jornadaStartHour: config.jornadaStartHour,
          timezone: config.timezone,
        }),
      ),
    );

    const result = buildComparison({
      weekStart: week,
      workers: [worker],
      shifts: shiftRecords.map((s) => ({
        userId: s.userId,
        jornadaDate: s.jornadaDate,
        start: s.start,
        end: s.end,
        endsNextDay: s.endsNextDay,
        note: s.note ?? null,
      })),
      clocks: clockRecords.map((c) => ({
        userId: c.userId,
        jornadaDate: c.jornadaDate,
        clockInAt: c.clockInAt,
        clockOutAt: c.clockOutAt ?? null,
        outComment: c.outComment ?? null,
        autoClosed: c.autoClosed ?? null,
      })),
      toleranceMin: config.toleranceMin,
      jornadaStartHour: config.jornadaStartHour,
      now,
      timezone: config.timezone,
    });

    return NextResponse.json({
      weekStart: week,
      weekEnd,
      jornadaStartHour: config.jornadaStartHour,
      toleranceMin: config.toleranceMin,
      workers: [worker],
      ...result,
    });
  } catch (err) {
    console.error("[api][rrhh][clock][week]", err);
    return NextResponse.json(
      { error: "No se pudieron cargar tus fichajes" },
      { status: 500 },
    );
  }
}
