import { NextResponse } from "next/server";
import { requireRrhhViewForApi } from "@/lib/auth/admin";
import { addDays } from "@/lib/datetime";
import {
  getRrhhConfig,
  listClockForWorkerRange,
  listShiftsForWorkersRange,
  listWorkerProfiles,
} from "@/lib/repositories/rrhh";
import { buildComparison } from "@/lib/rrhh/comparison";
import { settleClockIfExpired } from "@/lib/rrhh/clock-settle";

export const dynamic = "force-dynamic";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/admin/rrhh/comparison?week=YYYY-MM-DD`
 *
 * Compara el cuadrante con los fichajes reales de la semana (lunes→domingo),
 * por jornada y trabajador. Permiso: vista RRHH.
 */
export async function GET(req: Request) {
  const guard = await requireRrhhViewForApi();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const week = url.searchParams.get("week") ?? "";
  if (!WEEK_RE.test(week)) {
    return NextResponse.json(
      { error: "Parámetro 'week' inválido (yyyy-MM-dd)" },
      { status: 400 },
    );
  }
  const weekEnd = addDays(week, 6);

  try {
    const [profiles, config] = await Promise.all([
      listWorkerProfiles(),
      getRrhhConfig(),
    ]);
    const workers = profiles.map((p) => ({
      userId: p.userId,
      name: p.nameSnapshot,
    }));
    const userIds = workers.map((w) => w.userId);

    const shiftRecords = await listShiftsForWorkersRange(userIds, week, weekEnd);

    // Ventana ISO holgada para capturar fichajes cuya jornada cae en la semana
    // (incluye los que cruzan medianoche); luego filtramos por `jornadaDate`.
    const fromIso = `${addDays(week, -1)}T00:00:00.000Z`;
    const toIso = `${addDays(weekEnd, 2)}T00:00:00.000Z`;
    const clockGroups = await Promise.all(
      userIds.map((uid) => listClockForWorkerRange(uid, fromIso, toIso)),
    );
    const daySet = new Set(
      Array.from({ length: 7 }, (_, i) => addDays(week, i)),
    );
    const now = new Date();
    const rawClocks = clockGroups
      .flat()
      .filter((c) => daySet.has(c.jornadaDate));

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
      workers,
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
      workers,
      ...result,
    });
  } catch (err) {
    console.error("[api][admin][rrhh][comparison]", err);
    return NextResponse.json(
      { error: "No se pudo cargar la comparativa" },
      { status: 500 },
    );
  }
}
