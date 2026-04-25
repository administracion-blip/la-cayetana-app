import { NextResponse } from "next/server";
import {
  isOwnerOfReservation,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import { getPrepaymentConfig } from "@/lib/repositories/reservation-config";
import {
  getReservationById,
  listReservationEvents,
  listReservationMessages,
} from "@/lib/repositories/reservations";
import {
  renderPrepaymentInstructions,
  serializeReservation,
  serializeReservationEvent,
  serializeReservationMessage,
} from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/reservations/:id`
 *
 * Detalle completo que consumirá la UI del cliente: la propia reserva +
 * todos los mensajes del chat + eventos públicos del timeline +
 * instrucciones renderizadas de prepago (si aplica).
 */
export async function GET(
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
    const [messages, events] = await Promise.all([
      listReservationMessages(reservation.reservationId, { ascending: true }),
      listReservationEvents(reservation.reservationId, { onlyPublic: true }),
    ]);

    const dto = serializeReservation(reservation);
    if (
      reservation.prepaymentStatus !== "not_required" &&
      reservation.prepaymentAmountCents &&
      reservation.prepaymentDeadlineAt
    ) {
      const config = await getPrepaymentConfig();
      dto.prepaymentInstructions = renderPrepaymentInstructions(
        reservation.prepaymentInstructions ?? config.instructionsTemplate,
        {
          amountCents: reservation.prepaymentAmountCents,
          deadlineIso: reservation.prepaymentDeadlineAt,
          reservationDate: reservation.reservationDate,
          reservationTime: reservation.reservationTime,
          partySize: reservation.partySize,
          reservationId: reservation.reservationId,
          customerName: reservation.contact.name,
        },
      );
    }
    return NextResponse.json({
      reservation: dto,
      messages: messages.map(serializeReservationMessage),
      events: events.map(serializeReservationEvent),
    });
  } catch (err) {
    console.error("[api][reservations][detail][GET]", err);
    return NextResponse.json(
      { error: "No se pudo cargar la reserva" },
      { status: 500 },
    );
  }
}
