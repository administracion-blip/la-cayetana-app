import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import { addDays } from "@/lib/datetime";
import {
  listClockForWorkerRange,
  listWorkerProfiles,
} from "@/lib/repositories/rrhh";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tope defensivo: evita rangos enormes que disparen lecturas masivas. */
const MAX_RANGE_DAYS = 92;

/**
 * `GET /api/admin/rrhh/payroll-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
 *
 * Resumen de horas fichadas por trabajador y jornada en el rango, con los
 * datos necesarios para nómina (DNI, IBAN). Datos sensibles: permiso de
 * gestión RRHH. Solo cuenta fichajes cerrados (con salida registrada).
 */
export async function GET(req: Request) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "Parámetros 'from'/'to' inválidos (yyyy-MM-dd)" },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "La fecha inicial no puede ser posterior a la final" },
      { status: 400 },
    );
  }

  // Lista de días del rango (inclusive) y guardia de tamaño.
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `El rango no puede superar ${MAX_RANGE_DAYS} días` },
        { status: 400 },
      );
    }
  }
  const daySet = new Set(days);

  try {
    const profiles = await listWorkerProfiles();
    const active = profiles.filter((p) => p.active !== false);

    // Ventana ISO holgada para capturar fichajes cuya jornada cae en el rango
    // (incluye los que cruzan medianoche); luego filtramos por `jornadaDate`.
    const fromIso = `${addDays(from, -1)}T00:00:00.000Z`;
    const toIso = `${addDays(to, 2)}T00:00:00.000Z`;

    const workers = await Promise.all(
      active.map(async (p) => {
        const clocks = await listClockForWorkerRange(p.userId, fromIso, toIso);
        const byDay = new Map<string, number>();
        for (const c of clocks) {
          if (!daySet.has(c.jornadaDate)) continue;
          if (!c.clockOutAt) continue; // turno abierto: no computa horas
          const mins = Math.max(
            0,
            Math.round(
              (new Date(c.clockOutAt).getTime() -
                new Date(c.clockInAt).getTime()) /
                60000,
            ),
          );
          byDay.set(c.jornadaDate, (byDay.get(c.jornadaDate) ?? 0) + mins);
        }
        const dayRows = Array.from(byDay.entries())
          .map(([date, minutes]) => ({ date, minutes }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        const totalMin = dayRows.reduce((acc, r) => acc + r.minutes, 0);
        return {
          userId: p.userId,
          name: p.nameSnapshot,
          dni: p.dni,
          iban: p.iban,
          days: dayRows,
          totalMin,
        };
      }),
    );

    return NextResponse.json({ from, to, workers });
  } catch (err) {
    console.error("[api][admin][rrhh][payroll-summary]", err);
    return NextResponse.json(
      { error: "No se pudo generar el resumen" },
      { status: 500 },
    );
  }
}
