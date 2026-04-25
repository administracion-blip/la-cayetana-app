import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  PrepaymentProofNotFoundError,
  removePrepaymentProof,
  ReservationConflictError,
  ReservationNotFoundError,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  expectedVersion: z.coerce.number().int().nonnegative(),
  proofId: z.string().min(1).max(200),
});

/**
 * `POST /api/admin/reservations/:id/prepayment/remove` (JSON)
 * Elimina un comprobante por `proofId`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos" },
      { status: 400 },
    );
  }
  const { expectedVersion, proofId } = parsed.data;

  try {
    const updated = await removePrepaymentProof({
      reservationId: id,
      expectedVersion,
      proofId,
      updatedBy: `staff:${guard.user.id}`,
    });
    return NextResponse.json({
      reservation: serializeAdminReservation(updated),
    });
  } catch (err) {
    if (err instanceof PrepaymentProofNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof Error && err.message.includes("Solo se pueden quitar")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        {
          error: "La reserva cambió. Recarga e inténtalo de nuevo",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
