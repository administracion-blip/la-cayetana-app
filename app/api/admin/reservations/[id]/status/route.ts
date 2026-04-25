import { NextResponse } from "next/server";
import { z } from "zod";
import { createGuestToken } from "@/lib/auth/reservations";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { sendCustomerStatusChangedEmail } from "@/lib/email/reservations-mail";
import {
  getGuestById,
  getReservationById,
  ReservationConflictError,
  ReservationNotFoundError,
  updateReservationStatus,
} from "@/lib/repositories/reservations";
import { adminReservationStatusSchema } from "@/lib/validation-reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/status`
 *
 * Cambia el estado de una reserva respetando el optimistic concurrency.
 * Permite adjuntar un `systemMessage` que se publicará en el chat y
 * marcar el prepago como recibido en el mismo paso.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationStatusSchema>;
  try {
    payload = adminReservationStatusSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    if (payload.markPrepaymentReceived) {
      const current = await getReservationById(id);
      if (!current) {
        return NextResponse.json(
          { error: "Reserva no encontrada" },
          { status: 404 },
        );
      }
      if (current.prepaymentAmountCents) {
        return NextResponse.json(
          {
            error:
              "Para marcar la señal sube el justificante en la sección «Prepago» (Marcar recibido).",
          },
          { status: 400 },
        );
      }
    }
    const updated = await updateReservationStatus({
      reservationId: id,
      newStatus: payload.newStatus,
      expectedVersion: payload.expectedVersion,
      updatedBy: `staff:${guard.user.id}`,
      systemMessage: payload.systemMessage || undefined,
      markPrepaymentReceived: payload.markPrepaymentReceived,
      invalidateGuestSession: payload.invalidateGuestSession ?? true,
    });
    notifyCustomerOfStatusChange(updated, payload.systemMessage || undefined);
    return NextResponse.json({ reservation: serializeAdminReservation(updated) });
  } catch (err) {
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        {
          error:
            "La reserva cambió mientras la editabas. Recarga y vuelve a intentarlo.",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    console.error("[api][admin][reservations][status]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el estado" },
      { status: 500 },
    );
  }
}

/**
 * Dispara el email al cliente tras un cambio significativo de estado.
 * Se ejecuta fuera del camino de respuesta para no retrasar la UI admin.
 * Si la reserva es de guest regeneramos el magic-link con la nueva
 * `sessionVersion` (el endpoint `updateReservationStatus` ya la ha
 * incrementado si procede).
 */
function notifyCustomerOfStatusChange(
  reservation: Awaited<ReturnType<typeof updateReservationStatus>>,
  customMessage: string | undefined,
): void {
  (async () => {
    let guestToken: string | undefined;
    if (reservation.guestId) {
      const guest = await getGuestById(reservation.guestId);
      if (guest) {
        guestToken = await createGuestToken({
          guestId: guest.guestId,
          sessionVersion: guest.sessionVersion,
          email: guest.emailNormalized,
        });
      }
    }
    await sendCustomerStatusChangedEmail({
      reservation,
      newStatus: reservation.status,
      guestToken,
      customMessage,
    });
  })().catch((err) => {
    console.error("[admin][status][email]", err);
  });
}
