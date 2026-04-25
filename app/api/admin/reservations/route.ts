import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { addDays, formatLocalDate } from "@/lib/datetime";
import { getSlotsConfig } from "@/lib/repositories/reservation-config";
import {
  listReservationsByDate,
  listReservationsByStatus,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
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

/**
 * `GET /api/admin/reservations`
 *
 * Query params:
 *  - `status` (opcional, repetible): filtra por uno o varios estados.
 *  - `date` (opcional): `yyyy-MM-dd` o los literales `today` o `tomorrow`
 *    (día en la zona de la config de slots, coherente con el GSI `by-date`).
 *  - `q` (opcional): texto a buscar en contacto/notas (match case-insensitive).
 *  - `year` (opcional): año calendario (dígitos); limita a reservas cuya
 *    `reservationDate` es de ese año (en local yyyy-MM-dd).
 *
 * Si no se pasa ningún filtro devuelve todas las reservas activas (los
 * cuatro estados "en curso"). Pensado para el tablero del staff.
 */
function parseYearParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return null;
  return n;
}

function filterByYear<T extends { reservationDate: string }>(
  list: T[],
  year: number,
): T[] {
  const prefix = `${year}-`;
  return list.filter((r) => r.reservationDate.startsWith(prefix));
}

export async function GET(request: Request) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const statusParams = url.searchParams.getAll("status");
  const dateRaw = url.searchParams.get("date");
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const yearFilter = parseYearParam(url.searchParams.get("year"));

  let dateParam: string | null = dateRaw;
  if (dateParam === "today" || dateParam === "tomorrow") {
    const slots = await getSlotsConfig();
    const todayStr = formatLocalDate(new Date(), slots.timezone);
    dateParam =
      dateRaw === "tomorrow" ? addDays(todayStr, 1) : todayStr;
  }

  try {
    let items: ReservationRecord[] = [];

    if (dateParam) {
      items = await listReservationsByDate(dateParam);
    } else {
      const targets = statusParams.length
        ? (statusParams.filter((s) =>
            ALL_STATUSES.includes(s as ReservationStatus),
          ) as ReservationStatus[])
        : (["pending", "awaiting_customer", "awaiting_prepayment", "confirmed"] as ReservationStatus[]);
      const groups = await Promise.all(
        targets.map((s) => listReservationsByStatus(s, { limit: 500 })),
      );
      items = groups.flat();
    }

    if (statusParams.length && dateParam) {
      const allowed = new Set(statusParams);
      items = items.filter((r) => allowed.has(r.status));
    }
    if (query) {
      items = items.filter((r) => {
        const blob = [
          r.contact.name,
          r.contact.email,
          r.contact.phone,
          r.notes ?? "",
          r.reservationId,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(query);
      });
    }
    if (yearFilter != null) {
      items = filterByYear(items, yearFilter);
    }

    items.sort((a, b) =>
      a.reservationStartAtIso.localeCompare(b.reservationStartAtIso),
    );

    return NextResponse.json({
      reservations: items.map(serializeAdminReservation),
    });
  } catch (err) {
    console.error("[api][admin][reservations][list]", err);
    return NextResponse.json(
      { error: "No se pudieron listar las reservas" },
      { status: 500 },
    );
  }
}
