import { NextResponse } from "next/server";
import {
  identityIdsFromRequester,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import {
  findActiveReservationsForIdentity,
  listReservationsByCustomer,
} from "@/lib/repositories/reservations";
import { serializeReservation } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/reservations/me`
 *
 * Devuelve las reservas del cliente separadas en `active` (futuras y no
 * finalizadas) y `past` (resto). Base de la pantalla de decisión de la
 * app ("Gestionar mi reserva" / "Hacer una nueva reserva").
 */
export async function GET(request: Request) {
  const requester = await resolveReservationRequester(request);
  if (requester.kind === "guest_invalid") {
    return NextResponse.json(
      { error: "Tu enlace ha caducado. Solicita uno nuevo." },
      { status: 401 },
    );
  }
  const ids = identityIdsFromRequester(requester);
  if (!ids.userId && !ids.guestId) {
    return NextResponse.json(
      { active: [], past: [], anonymous: true },
      { status: 200 },
    );
  }

  try {
    const [allRaw, activeRaw] = await Promise.all([
      listReservationsByCustomer(
        ids.userId
          ? { userId: ids.userId }
          : { guestId: ids.guestId ?? undefined },
      ),
      findActiveReservationsForIdentity(
        ids.userId
          ? { userId: ids.userId }
          : { guestId: ids.guestId ?? undefined },
      ),
    ]);
    const activeIds = new Set(activeRaw.map((r) => r.reservationId));
    const past = allRaw
      .filter((r) => !activeIds.has(r.reservationId))
      .sort((a, b) =>
        b.reservationStartAtIso.localeCompare(a.reservationStartAtIso),
      );
    const active = activeRaw.sort((a, b) =>
      a.reservationStartAtIso.localeCompare(b.reservationStartAtIso),
    );

    return NextResponse.json({
      active: active.map(serializeReservation),
      past: past.map(serializeReservation),
    });
  } catch (err) {
    console.error("[api][reservations][me]", err);
    return NextResponse.json(
      { error: "No se pudieron obtener tus reservas" },
      { status: 500 },
    );
  }
}
