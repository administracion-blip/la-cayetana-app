import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { listReservationsByStatus } from "@/lib/repositories/reservations";
import type { ReservationRecord, ReservationStatus } from "@/types/models";

export const dynamic = "force-dynamic";

const ALL_STATUSES: ReservationStatus[] = [
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
  "cancelled_by_customer",
  "cancelled_by_staff",
  "no_show",
  "completed",
];

const PER_STATUS_LIST_CAP = 500;

function parseYearParam(
  raw: string | null,
): { ok: true; year: number } | { ok: false } {
  if (raw == null || raw === "") return { ok: false };
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return { ok: false };
  return { ok: true, year: n };
}

function filterByYear(
  list: ReservationRecord[],
  year: number,
): ReservationRecord[] {
  const prefix = `${year}-`;
  return list.filter((r) => r.reservationDate.startsWith(prefix));
}

/**
 * `GET /api/admin/reservations/summary`
 *
 * Query: `year` (opcional) filtra conteos a reservas con `reservationDate`
 * en ese año.
 *
 * Conteos aproximados por estado (hasta 500 reservas por estado en el
 * GSI, igual que el listado). Sirve para chips en el tablero.
 */
export async function GET(request: Request) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;

  const yearParam = parseYearParam(
    new URL(request.url).searchParams.get("year"),
  );

  try {
    const groups = await Promise.all(
      ALL_STATUSES.map((s) =>
        listReservationsByStatus(s, { limit: PER_STATUS_LIST_CAP }),
      ),
    );
    const byStatus: Record<ReservationStatus, number> = {} as Record<
      ReservationStatus,
      number
    >;
    ALL_STATUSES.forEach((s, i) => {
      let list = groups[i];
      if (yearParam.ok) {
        list = filterByYear(list, yearParam.year);
      }
      byStatus[s] = list.length;
    });
    return NextResponse.json({
      byStatus,
      perStatusListCap: PER_STATUS_LIST_CAP,
    });
  } catch (err) {
    console.error("[api][admin][reservations][summary][GET]", err);
    return NextResponse.json(
      { error: "No se pudo resumir las reservas" },
      { status: 500 },
    );
  }
}
