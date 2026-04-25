import { NextResponse } from "next/server";
import { z } from "zod";
import { createGuestToken } from "@/lib/auth/reservations";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { sendReservationScheduleChangedEmail } from "@/lib/email/reservations-mail";
import {
  getGuestById,
  getReservationById,
  ReservationConflictError,
  ReservationNotFoundError,
  updateReservationSchedule,
} from "@/lib/repositories/reservations";
import { ReservationSlotInvalidError } from "@/lib/repositories/reservation-config";
import { adminReservationScheduleSchema } from "@/lib/validation-reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/schedule`
 *
 * Cambia fecha/hora de la reserva. El repositorio invalida
 * automáticamente el magic link del guest (si aplica) para forzar
 * el re-envío de uno nuevo tras un cambio significativo.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationScheduleSchema>;
  try {
    payload = adminReservationScheduleSchema.parse(await request.json());
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
    const before = await getReservationById(id);
    const updated = await updateReservationSchedule({
      reservationId: id,
      expectedVersion: payload.expectedVersion,
      reservationDate: payload.reservationDate,
      reservationTime: payload.reservationTime,
      updatedBy: `staff:${guard.user.id}`,
      systemMessage: payload.systemMessage || undefined,
    });
    if (before) {
      notifyCustomerOfScheduleChange(
        updated,
        {
          reservationDate: before.reservationDate,
          reservationTime: before.reservationTime,
        },
        payload.systemMessage || undefined,
      );
    }
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
    if (err instanceof ReservationSlotInvalidError) {
      return NextResponse.json(
        { error: err.message, code: err.reason },
        { status: 400 },
      );
    }
    console.error("[api][admin][reservations][schedule]", err);
    return NextResponse.json(
      { error: "No se pudo reprogramar la reserva" },
      { status: 500 },
    );
  }
}

function notifyCustomerOfScheduleChange(
  reservation: Awaited<ReturnType<typeof updateReservationSchedule>>,
  previous: { reservationDate: string; reservationTime: string },
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
    await sendReservationScheduleChangedEmail({
      reservation,
      previous,
      guestToken,
      customMessage,
    });
  })().catch((err) => {
    console.error("[admin][schedule][email]", err);
  });
}
