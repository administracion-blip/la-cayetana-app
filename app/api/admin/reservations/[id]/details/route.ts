import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  ReservationConflictError,
  ReservationDuplicateError,
  ReservationNotFoundError,
  updateReservationDetails,
} from "@/lib/repositories/reservations";
import { ReservationMenuSelectionError } from "@/lib/repositories/reservation-menu-selections";
import { ReservationSlotInvalidError } from "@/lib/repositories/reservation-config";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
import { adminReservationDetailsSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/details`
 *
 * Edita en bloque contacto, nº de comensales, fecha y hora.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationDetailsSchema>;
  try {
    payload = adminReservationDetailsSchema.parse(await request.json());
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
    const updated = await updateReservationDetails({
      reservationId: id,
      expectedVersion: payload.expectedVersion,
      contact: payload.contact,
      partySize: payload.partySize,
      reservationDate: payload.reservationDate,
      reservationTime: payload.reservationTime,
      updatedBy: `staff:${guard.user.id}`,
      systemMessage: payload.systemMessage || undefined,
    });
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
    if (err instanceof ReservationDuplicateError) {
      return NextResponse.json(
        {
          error:
            "Ya hay otra reserva activa con ese email en la fecha indicada.",
          code: "duplicate",
        },
        { status: 409 },
      );
    }
    if (err instanceof ReservationMenuSelectionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err instanceof ReservationSlotInvalidError) {
      return NextResponse.json(
        { error: err.message, code: err.reason },
        { status: 400 },
      );
    }
    if (err instanceof Error && /Comensales fuera de rango/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[api][admin][reservations][details]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la reserva" },
      { status: 500 },
    );
  }
}
