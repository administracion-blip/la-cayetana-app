import { NextResponse } from "next/server";
import {
  isOwnerOfReservation,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import {
  getReservationById,
  ReservationConflictError,
  updateReservationStatus,
} from "@/lib/repositories/reservations";
import { serializeReservation } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/:id/accept`
 *
 * El cliente acepta la propuesta que staff dejó pendiente: solo aplica
 * cuando el estado actual es `awaiting_customer`. La transición pasa a
 * `confirmed`. Resto de estados → 409.
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
    if (reservation.status !== "awaiting_customer") {
      return NextResponse.json(
        {
          error:
            "Esta reserva no está esperando tu confirmación ahora mismo.",
        },
        { status: 409 },
      );
    }
    const updatedBy =
      requester.kind === "user"
        ? requester.user.id
        : `guest:${requester.guest.guestId}`;
    const updated = await updateReservationStatus({
      reservationId: reservation.reservationId,
      expectedVersion: reservation.version,
      newStatus: "confirmed",
      updatedBy,
      systemMessage: "El cliente confirmó los nuevos detalles de la reserva.",
    });
    return NextResponse.json({ reservation: serializeReservation(updated) });
  } catch (err) {
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        {
          error:
            "La reserva cambió mientras la aceptabas. Vuelve a cargarla.",
        },
        { status: 409 },
      );
    }
    console.error("[api][reservations][accept][POST]", err);
    return NextResponse.json(
      { error: "No se pudo aceptar la reserva" },
      { status: 500 },
    );
  }
}
