import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";
import { hashTag } from "@/lib/log/redact";
import { getPrepaymentConfig } from "@/lib/repositories/reservation-config";
import { getReservationById } from "@/lib/repositories/reservations";
import { renderPrepaymentInstructions } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reservations/:id/prepayment/remind-email`
 *
 * Envía al cliente el mismo bloque de instrucciones que ve el staff en el
 * modal "Volver a solicitar prepago": si hay texto persistido en la
 * reserva se usa; si no (caso habitual), se genera con la plantilla de
 * config y los datos de la reserva, igual que `GET /api/admin/reservations/:id`.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const reservation = await getReservationById(id);
  if (!reservation) {
    return NextResponse.json(
      { error: "Reserva no encontrada" },
      { status: 404 },
    );
  }

  let body = reservation.prepaymentInstructions?.trim() ?? "";

  if (
    !body &&
    reservation.prepaymentStatus !== "not_required" &&
    reservation.prepaymentAmountCents &&
    reservation.prepaymentDeadlineAt
  ) {
    try {
      const config = await getPrepaymentConfig();
      body = renderPrepaymentInstructions(
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
      ).trim();
    } catch (err) {
      console.warn(
        "[prepayment-remind-email] render prepayment instructions failed",
        err,
      );
    }
  }

  if (!body) {
    return NextResponse.json(
      { error: "No hay instrucciones de prepago para esta reserva" },
      { status: 400 },
    );
  }

  const to = reservation.contact.email?.trim();
  if (!to) {
    return NextResponse.json(
      { error: "La reserva no tiene email de contacto" },
      { status: 400 },
    );
  }

  const subject = `Instrucciones de prepago · La Cayetana · ${reservation.reservationDate} ${reservation.reservationTime}`;
  const result = await sendSesPlainTextEmail({
    to,
    subject,
    body: `${body}\n\n— La Cayetana · Granada`,
  });

  if (!result.ok) {
    if (result.mode === "log-only") {
      return NextResponse.json(
        {
          error:
            "Correo no configurado en el servidor (SES_FROM_EMAIL). Avisa al administrador.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          "errorMessage" in result && result.errorMessage
            ? result.errorMessage
            : "No se pudo enviar el correo. Comprueba el email del cliente y los permisos de SES.",
      },
      { status: 502 },
    );
  }

  console.info(
    `[audit][prepayment-remind-email] staff=${guard.user.id} reservationId=${id} toHash=${hashTag(to)}`,
  );

  return NextResponse.json({ ok: true });
}
