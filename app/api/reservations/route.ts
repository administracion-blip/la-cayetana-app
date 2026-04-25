import { NextResponse } from "next/server";
import { isTableReservationClosed } from "@/lib/access-gates";
import { setGuestCookieOnResponse } from "@/lib/auth/guest-cookie";
import { createGuestToken } from "@/lib/auth/reservations";
import { resolveReservationRequester } from "@/lib/auth/reservation-request";
import {
  sendGuestMagicLinkEmail,
  sendStaffNewReservationAlertEmail,
} from "@/lib/email/reservations-mail";
import { isLikelyEmail, isLikelyPhone } from "@/lib/identity";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  getPrepaymentConfig,
} from "@/lib/repositories/reservation-config";
import { ReservationSlotInvalidError } from "@/lib/repositories/reservation-config";
import { ReservationMenuSelectionError } from "@/lib/repositories/reservation-menu-selections";
import {
  createReservation,
  ReservationDuplicateError,
  upsertGuest,
} from "@/lib/repositories/reservations";
import {
  renderPrepaymentInstructions,
  serializeReservation,
} from "@/lib/serialization/reservations";
import { createReservationSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations`
 *
 * Crea una reserva. Identidad aceptada:
 *  - Socio logueado (cookie `lc_session`): `contact` opcional (se usa el
 *    del perfil) pero puede sobreescribirse.
 *  - Guest (sin sesión): `contact` obligatorio. Se crea/reutiliza el
 *    GuestRecord por email y se devuelve un guest token JWT para que
 *    pueda gestionar la reserva después desde cualquier dispositivo.
 *
 * Rate-limit: 10 creaciones por IP cada 10 minutos (defensivo).
 */
export async function POST(request: Request) {
  if (await isTableReservationClosed()) {
    return NextResponse.json(
      { error: "Las reservas online están temporalmente cerradas." },
      { status: 403 },
    );
  }
  try {
    const ip = extractClientIp(request);
    await enforceRateLimit({
      key: `reservation:create:${ip}`,
      windowMs: 10 * 60 * 1000,
      max: 10,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Demasiadas reservas desde tu IP, inténtalo más tarde" },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } },
      );
    }
    throw err;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Payload JSON inválido" },
      { status: 400 },
    );
  }
  const parsed = createReservationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Revisa los datos de la reserva",
      },
      { status: 400 },
    );
  }

  const requester = await resolveReservationRequester(request);
  if (requester.kind === "guest_invalid") {
    return NextResponse.json(
      { error: "Tu enlace ha caducado. Solicita uno nuevo." },
      { status: 401 },
    );
  }

  try {
    const payload = parsed.data;

    if (requester.kind === "user") {
      const user = requester.user;
      const contact = {
        name: payload.contact?.name?.trim() || user.name,
        email: payload.contact?.email?.trim() || user.email,
        phone: payload.contact?.phone?.trim() || user.phone || "",
      };
      if (!contact.phone) {
        return NextResponse.json(
          { error: "Necesitamos un teléfono de contacto para la reserva" },
          { status: 400 },
        );
      }
      if (!isLikelyPhone(contact.phone)) {
        return NextResponse.json(
          { error: "Teléfono no válido" },
          { status: 400 },
        );
      }

      const record = await createReservation({
        userId: user.id,
        guestId: null,
        membershipId: user.membershipId,
        contact,
        reservationDate: payload.reservationDate,
        reservationTime: payload.reservationTime,
        partySize: payload.partySize,
        notes: payload.notes || undefined,
        menuLines: payload.menuLines,
        createdVia: "app",
      });
      sendStaffNewReservationAlertEmail({ reservation: record }).catch((err) => {
        console.error("[reservations][create][staff-alert]", err);
      });
      const dto = serializeReservation(record);
      dto.prepaymentInstructions = await maybeRenderInstructions(record);
      return NextResponse.json({ reservation: dto });
    }

    // Resto de casos: anonymous o guest explícito → tratamos como guest.
    if (!payload.contact) {
      return NextResponse.json(
        { error: "Necesitamos tus datos de contacto para crear la reserva" },
        { status: 400 },
      );
    }
    if (!isLikelyEmail(payload.contact.email)) {
      return NextResponse.json(
        { error: "Email no válido" },
        { status: 400 },
      );
    }
    if (!isLikelyPhone(payload.contact.phone)) {
      return NextResponse.json(
        { error: "Teléfono no válido" },
        { status: 400 },
      );
    }

    const guest = await upsertGuest({
      name: payload.contact.name,
      email: payload.contact.email,
      phone: payload.contact.phone,
    });

    const record = await createReservation({
      userId: null,
      guestId: guest.guestId,
      contact: {
        name: payload.contact.name,
        email: payload.contact.email,
        phone: payload.contact.phone,
      },
      reservationDate: payload.reservationDate,
      reservationTime: payload.reservationTime,
      partySize: payload.partySize,
      notes: payload.notes || undefined,
      menuLines: payload.menuLines,
      createdVia: "guest_link",
    });

    const token = await createGuestToken({
      guestId: guest.guestId,
      sessionVersion: guest.sessionVersion,
      email: guest.emailNormalized,
    });

    sendGuestMagicLinkEmail({
      toEmail: guest.email,
      name: guest.name,
      guestToken: token,
      reservation: {
        reservationDate: record.reservationDate,
        reservationTime: record.reservationTime,
        partySize: record.partySize,
      },
    }).catch((err) => {
      console.error("[reservations][create][guest-magic-link]", err);
    });
    sendStaffNewReservationAlertEmail({ reservation: record }).catch((err) => {
      console.error("[reservations][create][staff-alert]", err);
    });

    const dto = serializeReservation(record);
    dto.prepaymentInstructions = await maybeRenderInstructions(record);
    const response = NextResponse.json({
      reservation: dto,
      guestToken: token,
      guestId: guest.guestId,
    });
    // PR-3.1: además de devolver el token en JSON (compat localStorage),
    // lo materializamos en una cookie httpOnly para que las próximas
    // peticiones autentiquen sin exponer el JWT a JavaScript.
    setGuestCookieOnResponse(response, token);
    return response;
  } catch (err) {
    if (err instanceof ReservationSlotInvalidError) {
      return NextResponse.json(
        { error: err.message, code: err.reason },
        { status: 400 },
      );
    }
    if (err instanceof ReservationMenuSelectionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err instanceof ReservationDuplicateError) {
      return NextResponse.json(
        {
          error:
            "Ya tienes una reserva activa ese día. Gestiónala desde 'Mis reservas'.",
          code: "duplicate",
          reservationId: err.reservationId,
        },
        { status: 409 },
      );
    }
    console.error("[api][reservations][POST]", err);
    return NextResponse.json(
      { error: "No se pudo crear la reserva" },
      { status: 500 },
    );
  }
}

async function maybeRenderInstructions(record: {
  reservationId: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  prepaymentStatus: string;
  prepaymentAmountCents?: number;
  prepaymentDeadlineAt?: string;
  contact: { name: string };
}): Promise<string | undefined> {
  if (
    record.prepaymentStatus === "not_required" ||
    !record.prepaymentAmountCents ||
    !record.prepaymentDeadlineAt
  ) {
    return undefined;
  }
  const config = await getPrepaymentConfig();
  return renderPrepaymentInstructions(config.instructionsTemplate, {
    amountCents: record.prepaymentAmountCents,
    deadlineIso: record.prepaymentDeadlineAt,
    reservationDate: record.reservationDate,
    reservationTime: record.reservationTime,
    partySize: record.partySize,
    reservationId: record.reservationId,
    customerName: record.contact.name,
  });
}

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
