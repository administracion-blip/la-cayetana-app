import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  ReservationNotFoundError,
  addReservationNote,
  listReservationNotes,
} from "@/lib/repositories/reservations";
import { serializeReservationNote } from "@/lib/serialization/reservations";
import { adminReservationNoteSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/:id/notes` — listar notas internas.
 * `POST /api/admin/reservations/:id/notes` — añadir una nota nueva.
 *
 * Las notas son privadas de staff (nunca se envían al cliente).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  try {
    const notes = await listReservationNotes(id);
    return NextResponse.json({ notes: notes.map(serializeReservationNote) });
  } catch (err) {
    console.error("[api][admin][reservations][notes][get]", err);
    return NextResponse.json(
      { error: "No se pudieron obtener las notas" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("write_notes");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let payload: z.infer<typeof adminReservationNoteSchema>;
  try {
    payload = adminReservationNoteSchema.parse(await request.json());
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
    const note = await addReservationNote({
      reservationId: id,
      body: payload.body,
      createdByUserId: guard.user.id,
      createdByDisplayName: guard.user.name || "Staff",
    });
    return NextResponse.json({ note: serializeReservationNote(note) });
  } catch (err) {
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    console.error("[api][admin][reservations][notes][post]", err);
    return NextResponse.json(
      { error: "No se pudo añadir la nota" },
      { status: 500 },
    );
  }
}
