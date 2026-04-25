import { NextResponse } from "next/server";
import {
  isOwnerOfReservation,
  resolveReservationRequester,
} from "@/lib/auth/reservation-request";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  addReservationMessage,
  getReservationById,
  isActiveReservationStatus,
} from "@/lib/repositories/reservations";
import { serializeReservationMessage } from "@/lib/serialization/reservations";
import { reservationMessageSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/:id/messages`
 *
 * Envía un mensaje del cliente en el chat de la reserva. Solo se permite
 * en reservas activas: en reservas finalizadas/canceladas el chat queda
 * en modo lectura (lo enfocamos en la UI, pero aquí también lo cortamos
 * por seguridad).
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

  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Payload JSON inválido" },
      { status: 400 },
    );
  }
  const parsed = reservationMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Mensaje no válido" },
      { status: 400 },
    );
  }

  try {
    await enforceRateLimit({
      key: `reservation:message:${id}:${
        requester.kind === "user" ? requester.user.id : requester.guest.guestId
      }`,
      windowMs: 60 * 1000,
      max: 20,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Estás enviando mensajes muy rápido. Espera unos segundos." },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } },
      );
    }
    throw err;
  }

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
        { error: "Esta reserva ya no admite mensajes" },
        { status: 409 },
      );
    }
    const authorDisplayName =
      requester.kind === "user"
        ? requester.user.name
        : requester.guest.name || requester.guest.email;
    const authorId =
      requester.kind === "user"
        ? requester.user.id
        : requester.guest.guestId;
    const message = await addReservationMessage({
      reservationId: reservation.reservationId,
      authorType: "customer",
      authorId,
      authorDisplayName,
      body: parsed.data.body,
      documentIds: parsed.data.documentIds,
    });
    return NextResponse.json({
      message: serializeReservationMessage(message),
    });
  } catch (err) {
    console.error("[api][reservations][messages][POST]", err);
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje" },
      { status: 500 },
    );
  }
}
