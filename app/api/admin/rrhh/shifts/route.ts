import { NextResponse } from "next/server";
import {
  requireRrhhManageForApi,
  requireRrhhViewForApi,
} from "@/lib/auth/admin";
import { addDays, parseHhMm } from "@/lib/datetime";
import {
  createShift,
  getPositions,
  getRrhhConfig,
  getWorkerProfile,
  listShiftsForWorkersRange,
  listWorkerProfiles,
} from "@/lib/repositories/rrhh";
import { createShiftSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/admin/rrhh/shifts?week=YYYY-MM-DD`
 *
 * Devuelve el roster de trabajadores, sus turnos de la semana (lunes→domingo
 * a partir de `week`) y la hora de corte de jornada. Permiso: vista RRHH.
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
    const [profiles, config, positions] = await Promise.all([
      listWorkerProfiles(),
      getRrhhConfig(),
      getPositions(),
    ]);
    const colorByName = new Map(positions.map((p) => [p.name, p.color]));
    const workers = profiles
      .filter((p) => p.active !== false)
      .map((p) => ({
        userId: p.userId,
        name: p.nameSnapshot,
        position: p.position ?? null,
        positionColor: p.position ? colorByName.get(p.position) ?? null : null,
      }));
    const shifts = await listShiftsForWorkersRange(
      workers.map((w) => w.userId),
      week,
      weekEnd,
    );
    return NextResponse.json({
      weekStart: week,
      weekEnd,
      jornadaStartHour: config.jornadaStartHour,
      workers,
      shifts: shifts.map((s) => ({
        shiftId: s.shiftId,
        userId: s.userId,
        jornadaDate: s.jornadaDate,
        start: s.start,
        end: s.end,
        endsNextDay: s.endsNextDay,
        note: s.note ?? null,
      })),
    });
  } catch (err) {
    console.error("[api][admin][rrhh][shifts][list]", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los turnos" },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/admin/rrhh/shifts`
 *
 * Crea un turno para un trabajador en una jornada. Permiso: gestión RRHH.
 */
export async function POST(req: Request) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = createShiftSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos del turno inválidos" },
      { status: 400 },
    );
  }

  const { userId, jornadaDate, start, end, note } = parsed.data;
  const profile = await getWorkerProfile(userId);
  if (!profile) {
    return NextResponse.json(
      { error: "Trabajador no encontrado" },
      { status: 404 },
    );
  }

  const startMin = parseHhMm(start);
  const endMin = parseHhMm(end);
  if (startMin === null || endMin === null) {
    return NextResponse.json({ error: "Horas inválidas" }, { status: 400 });
  }
  const endsNextDay = endMin <= startMin;

  try {
    const shift = await createShift({
      userId,
      workerNameSnapshot: profile.nameSnapshot,
      jornadaDate,
      start,
      end,
      endsNextDay,
      note: note?.trim() || undefined,
      createdByUserId: guard.user.id,
    });
    return NextResponse.json({
      ok: true,
      shift: {
        shiftId: shift.shiftId,
        userId: shift.userId,
        jornadaDate: shift.jornadaDate,
        start: shift.start,
        end: shift.end,
        endsNextDay: shift.endsNextDay,
        note: shift.note ?? null,
      },
    });
  } catch (err) {
    console.error("[api][admin][rrhh][shifts][create]", err);
    return NextResponse.json(
      { error: "No se pudo crear el turno" },
      { status: 500 },
    );
  }
}
