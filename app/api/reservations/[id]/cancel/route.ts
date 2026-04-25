import { NextResponse } from "next/server";
import {
  isOwnerOfReservation,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import {
  getReservationById,
  isActiveReservationStatus,
  ReservationConflictError,
  updateReservationStatus,
} from "@/lib/repositories/reservations";
import { serializeReservation } from "@/lib/serialization/reservations";
import { reservationCancelSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/:id/cancel`
 *
 * Cancelación por parte del cliente. Requiere que la reserva esté en un
 * estado activo. Deja el estado `cancelled_by_customer` y añade un
 * mensaje del sistema al chat para que staff lo vea fácilmente en el
 * tablero.
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

  let json: unknown = undefined;
  try {
    const text = await request.text();
    if (text) json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Payload JSON inválido" },
      { status: 400 },
    );
  }
  const parsed = reservationCancelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Motivo no válido" },
      { status: 400 },
    );
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
    if (!isActiveReservationStatus(reservation.status)) {
      return NextResponse.json(
        { error: "Esta reserva ya no puede cancelarse" },
        { status: 409 },
      );
    }

    const updatedBy =
      requester.kind === "user"
        ? requester.user.id
        : `guest:${requester.guest.guestId}`;
    const reason = (parsed.data as { reason?: string } | undefined)?.reason?.trim();
    const systemMessage = reason
      ? `El cliente canceló la reserva. Motivo: ${reason}`
      : "El cliente canceló la reserva.";

    const updated = await updateReservationStatus({
      reservationId: reservation.reservationId,
      expectedVersion: reservation.version,
      newStatus: "cancelled_by_customer",
      updatedBy,
      systemMessage,
      eventMeta: reason ? { reason } : undefined,
    });
    return NextResponse.json({ reservation: serializeReservation(updated) });
  } catch (err) {
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        {
          error:
            "La reserva cambió mientras la cancelabas. Vuelve a cargarla.",
        },
        { status: 409 },
      );
    }
    console.error("[api][reservations][cancel][POST]", err);
    return NextResponse.json(
      { error: "No se pudo cancelar la reserva" },
      { status: 500 },
    );
  }
}
