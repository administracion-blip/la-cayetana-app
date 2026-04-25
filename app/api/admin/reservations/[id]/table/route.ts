import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  ReservationConflictError,
  ReservationNotFoundError,
  updateReservationTable,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
import { adminReservationTableSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/table`
 *
 * Asigna, cambia o borra la etiqueta de mesa (texto libre, solo staff).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationTableSchema>;
  try {
    payload = adminReservationTableSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }
  const trimmed = (payload.tableLabel ?? "").trim();
  const tableLabel = trimmed === "" ? null : trimmed;

  try {
    const updated = await updateReservationTable({
      reservationId: id,
      expectedVersion: payload.expectedVersion,
      tableLabel,
      updatedBy: `staff:${guard.user.id}`,
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
    console.error("[api][admin][reservations][table]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la mesa" },
      { status: 500 },
    );
  }
}
