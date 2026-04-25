import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { buildReservationForecast } from "@/lib/reservations/forecast-aggregate";
import {
  ACTIVE_RESERVATION_STATUSES,
  listActiveReservationsForDate,
} from "@/lib/repositories/reservations";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/admin/reservations/forecast?date=yyyy-MM-dd`
 *
 * Agregados de cocina / compra para **un solo día** (fecha de reserva),
 * reservas en estados activos. Mismo acceso que el listado (view).
 */
function parseDateParam(raw: string | null): string | null {
  if (raw == null || raw === "") return null;
  if (!DATE_RE.test(raw)) return null;
  return raw;
}

export async function GET(request: Request) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;

  const date = parseDateParam(new URL(request.url).searchParams.get("date"));
  if (date == null) {
    return NextResponse.json(
      { error: "Indica un día (date=yyyy-MM-dd)" },
      { status: 400 },
    );
  }

  try {
    const items = await listActiveReservationsForDate(date);
    const payload = buildReservationForecast(date, items, {
      includeByDateTable: false,
    });
    return NextResponse.json({
      ...payload,
      statusScope: [...ACTIVE_RESERVATION_STATUSES],
    });
  } catch (err) {
    console.error("[api][admin][reservations][forecast]", err);
    return NextResponse.json(
      { error: "No se pudo calcular la previsión" },
      { status: 500 },
    );
  }
}
