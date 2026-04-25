import { NextResponse } from "next/server";
import { sendGuestOtpEmail } from "@/lib/email/reservations-mail";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  findGuestByEmail,
  listReservationsByEmail,
} from "@/lib/repositories/reservations";
import { createOtpForEmail } from "@/lib/repositories/reservation-otp";
import { guestOtpRequestSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/guest/otp/request`
 *
 * Pide un código OTP (6 dígitos) para que un guest recupere acceso a
 * sus reservas sin abrir el magic link.
 *
 * Respuesta SIEMPRE neutral (`{ ok: true }`) aunque el email no tenga
 * reservas, para no convertir este endpoint en un oráculo de cuentas.
 *
 * Rate-limit: 5 peticiones por IP cada 10 minutos.
 */
export async function POST(request: Request) {
  try {
    const ip = extractClientIp(request);
    await enforceRateLimit({
      key: `reservation:guest-otp:${ip}`,
      windowMs: 10 * 60 * 1000,
      max: 5,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        {
          error:
            "Demasiadas peticiones. Espera unos minutos e inténtalo de nuevo.",
        },
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
  const parsed = guestOtpRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Email no válido" },
      { status: 400 },
    );
  }

  try {
    const guest = await findGuestByEmail(parsed.data.email);
    if (!guest) {
      return NextResponse.json({ ok: true });
    }
    // Evita abuso: solo generamos OTP si hay al menos una reserva.
    const reservations = await listReservationsByEmail(guest.emailNormalized, {
      limit: 1,
    });
    if (reservations.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const otp = await createOtpForEmail(guest.emailNormalized);
    // Fire-and-forget: no bloqueamos la respuesta por el envío del email.
    sendGuestOtpEmail({
      toEmail: guest.email,
      code: otp.code,
      ttlMinutes: otp.ttlMinutes,
    }).catch((err) => {
      console.error("[reservations][otp][request][email]", err);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][reservations][guest][otp][request]", err);
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud" },
      { status: 500 },
    );
  }
}

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
