import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import { parseHhMm } from "@/lib/datetime";
import { deleteShift, updateShift } from "@/lib/repositories/rrhh";
import { updateShiftSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `DELETE /api/admin/rrhh/shifts/:shiftId?userId=…&jornadaDate=…`
 *
 * Borra un turno. Se necesitan `userId` y `jornadaDate` para reconstruir la
 * clave del ítem. Permiso: gestión RRHH.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { shiftId } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const jornadaDate = url.searchParams.get("jornadaDate") ?? "";

  if (!shiftId || !userId || !ISO_DATE_RE.test(jornadaDate)) {
    return NextResponse.json(
      { error: "Parámetros del turno incompletos" },
      { status: 400 },
    );
  }

  try {
    await deleteShift(userId, jornadaDate, shiftId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][admin][rrhh][shifts][delete]", err);
    return NextResponse.json(
      { error: "No se pudo borrar el turno" },
      { status: 500 },
    );
  }
}

/**
 * `PATCH /api/admin/rrhh/shifts/:shiftId?userId=…&jornadaDate=…`
 *
 * Actualiza horario y nota de un turno. Permiso: gestión RRHH.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { shiftId } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const jornadaDate = url.searchParams.get("jornadaDate") ?? "";

  if (!shiftId || !userId || !ISO_DATE_RE.test(jornadaDate)) {
    return NextResponse.json(
      { error: "Parámetros del turno incompletos" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = updateShiftSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos del turno inválidos" },
      { status: 400 },
    );
  }

  const { start, end, note } = parsed.data;
  const startMin = parseHhMm(start);
  const endMin = parseHhMm(end);
  if (startMin === null || endMin === null) {
    return NextResponse.json({ error: "Horas inválidas" }, { status: 400 });
  }
  const endsNextDay = endMin <= startMin;

  try {
    await updateShift(userId, jornadaDate, shiftId, {
      start,
      end,
      endsNextDay,
      note: note?.trim() || undefined,
    });
    return NextResponse.json({
      ok: true,
      shift: {
        shiftId,
        userId,
        jornadaDate,
        start,
        end,
        endsNextDay,
        note: note?.trim() || null,
      },
    });
  } catch (err) {
    console.error("[api][admin][rrhh][shifts][update]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el turno" },
      { status: 500 },
    );
  }
}
