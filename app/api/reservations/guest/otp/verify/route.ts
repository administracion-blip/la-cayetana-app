import { NextResponse } from "next/server";
import { setGuestCookieOnResponse } from "@/lib/auth/guest-cookie";
import { createGuestToken } from "@/lib/auth/reservations";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { findGuestByEmail } from "@/lib/repositories/reservations";
import { verifyAndConsumeOtp } from "@/lib/repositories/reservation-otp";
import { guestOtpVerifySchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/guest/otp/verify`
 *
 * Verifica el código OTP y, si es correcto, emite un guestToken JWT
 * listo para usar en el resto de endpoints del módulo de reservas.
 *
 * Rate-limit: 10 intentos por IP cada 10 minutos.
 */
export async function POST(request: Request) {
  try {
    const ip = extractClientIp(request);
    await enforceRateLimit({
      key: `reservation:guest-otp-verify:${ip}`,
      windowMs: 10 * 60 * 1000,
      max: 10,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos. Espera unos minutos y vuelve a pedir un código.",
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
  const parsed = guestOtpVerifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await verifyAndConsumeOtp(parsed.data.email, parsed.data.code);
    if (!result.ok) {
      if (result.reason === "invalid") {
        return NextResponse.json(
          {
            error: "Código incorrecto",
            code: "invalid",
            remainingAttempts: result.remainingAttempts,
          },
          { status: 400 },
        );
      }
      if (result.reason === "expired") {
        return NextResponse.json(
          {
            error: "El código ha caducado. Pide uno nuevo.",
            code: "expired",
          },
          { status: 400 },
        );
      }
      if (result.reason === "locked") {
        return NextResponse.json(
          {
            error:
              "Has agotado los intentos. Pide un código nuevo para continuar.",
            code: "locked",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "No hay ningún código activo para este email.", code: "not_found" },
        { status: 400 },
      );
    }

    const guest = await findGuestByEmail(parsed.data.email);
    if (!guest) {
      // Improbable tras un OTP creado correctamente, pero defensivo.
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 },
      );
    }
    const token = await createGuestToken({
      guestId: guest.guestId,
      sessionVersion: guest.sessionVersion,
      email: guest.emailNormalized,
    });
    const response = NextResponse.json({
      ok: true,
      guestToken: token,
      guestId: guest.guestId,
      email: guest.email,
      name: guest.name,
    });
    // PR-3.1: el token también queda en cookie httpOnly. La respuesta
    // sigue trayendo `guestToken` en JSON para compat con clientes que
    // todavía leen/escriben localStorage.
    setGuestCookieOnResponse(response, token);
    return response;
  } catch (err) {
    console.error("[api][reservations][guest][otp][verify]", err);
    return NextResponse.json(
      { error: "No se pudo verificar el código" },
      { status: 500 },
    );
  }
}

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
