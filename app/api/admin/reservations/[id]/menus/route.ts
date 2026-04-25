import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { ReservationMenuSelectionError } from "@/lib/repositories/reservation-menu-selections";
import {
  getReservationById,
  ReservationConflictError,
  ReservationNotFoundError,
  updateReservationMenuLineItems,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
import { adminReservationMenusSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/menus`
 * Staff: ajusta reparto de menús (suma = comensales).
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
  const parsed = adminReservationMenusSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const resv = await getReservationById(id);
  if (!resv) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  try {
    const updated = await updateReservationMenuLineItems({
      reservationId: id,
      expectedVersion: body.expectedVersion,
      menuLines: body.menuLines,
      updatedBy: guard.user.id,
      systemMessage: body.systemMessage?.trim() || undefined,
    });
    return NextResponse.json({
      reservation: serializeAdminReservation(updated),
    });
  } catch (err) {
    if (err instanceof ReservationMenuSelectionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        { error: "La reserva fue modificada, recarga e inténtalo de nuevo" },
        { status: 409 },
      );
    }
    console.error("[api][admin][reservation][menus]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el menú" },
      { status: 500 },
    );
  }
}
