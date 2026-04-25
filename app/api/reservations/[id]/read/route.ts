import { NextResponse } from "next/server";
import {
  isOwnerOfReservation,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import {
  getReservationById,
  markReservationMessagesRead,
} from "@/lib/repositories/reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/:id/read`
 *
 * Marca como leídos todos los mensajes de la reserva para el cliente (o
 * el guest). Llamada idempotente: el handler pone a cero el contador
 * `unreadForCustomer` aunque ya lo estuviera.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requester = await resolveReservationRequester(request);
  if (requester.kind === "guest_invalid") {
    return NextResponse.json(
      { error: "Tu enlace ha caducado. Solicita uno nuevo." },
      { status: 401 },
    );
  }
  if (requester.kind === "anonymous") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    if (!isOwnerOfReservation(requester, reservation)) {
      return NextResponse.json(
        { error: "No tienes acceso a esta reserva" },
        { status: 403 },
      );
    }
    await markReservationMessagesRead({
      reservationId: reservation.reservationId,
      who: "customer",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][reservations][read][POST]", err);
    return NextResponse.json(
      { error: "No se pudo marcar como leída" },
      { status: 500 },
    );
  }
}
