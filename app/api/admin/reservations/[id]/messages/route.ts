import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  ReservationNotFoundError,
  addReservationMessage,
} from "@/lib/repositories/reservations";
import { serializeReservationMessage } from "@/lib/serialization/reservations";
import { adminReservationMessageSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/messages`
 *
 * Envía un mensaje en el chat como staff. Publica al cliente (aumenta
 * `unreadForCustomer`). Requiere permiso `reply_chat`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("reply_chat");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationMessageSchema>;
  try {
    payload = adminReservationMessageSchema.parse(await request.json());
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
    const msg = await addReservationMessage({
      reservationId: id,
      authorType: "staff",
      authorId: guard.user.id,
      authorDisplayName: "Equipo La Cayetana",
      body: payload.body,
      documentIds: payload.documentIds,
    });
    return NextResponse.json({ message: serializeReservationMessage(msg) });
  } catch (err) {
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    console.error("[api][admin][reservations][messages]", err);
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje" },
      { status: 500 },
    );
  }
}
