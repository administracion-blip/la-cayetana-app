import { NextResponse } from "next/server";
import {
  permissionsForUser,
  requireReservationStaffForApi,
} from "@/lib/auth/reservation-admin";
import {
  getReservationById,
  listReservationEvents,
  listReservationMessages,
  listReservationNotes,
  markReservationMessagesRead,
} from "@/lib/repositories/reservations";
import { getPrepaymentConfig } from "@/lib/repositories/reservation-config";
import {
  renderPrepaymentInstructions,
  serializeAdminReservation,
  serializeAdminReservationEvent,
  serializeReservationMessage,
  serializeReservationNote,
} from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/:id`
 *
 * Detalle completo para el backoffice: reserva + mensajes + eventos
 * (incluidos internos) + notas internas. Marca el chat como leído por
 * staff al abrirlo (reset de `unreadForStaff`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const permissions = permissionsForUser(guard.user);

  const { id } = await params;
  try {
    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }

    const [messages, events, notes] = await Promise.all([
      listReservationMessages(id),
      listReservationEvents(id),
      listReservationNotes(id),
    ]);

    // Reset contador de no-leídos del staff en background.
    markReservationMessagesRead({ reservationId: id, who: "staff" }).catch(
      (err) =>
        console.warn("[admin][reservations][detail] markRead failed", err),
    );

    const reservationDto = serializeAdminReservation(reservation);
    if (
      reservation.prepaymentStatus !== "not_required" &&
      reservation.prepaymentAmountCents &&
      reservation.prepaymentDeadlineAt
    ) {
      try {
        const config = await getPrepaymentConfig();
        reservationDto.prepaymentInstructions = renderPrepaymentInstructions(
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
      } catch (err) {
        console.warn(
          "[admin][reservations][detail] render prepayment instructions failed",
          err,
        );
      }
    }

    return NextResponse.json({
      reservation: reservationDto,
      messages: messages.map(serializeReservationMessage),
      events: events.map(serializeAdminReservationEvent),
      notes: notes.map(serializeReservationNote),
      permissions,
    });
  } catch (err) {
    console.error("[api][admin][reservations][detail]", err);
    return NextResponse.json(
      { error: "No se pudo obtener la reserva" },
      { status: 500 },
    );
  }
}
