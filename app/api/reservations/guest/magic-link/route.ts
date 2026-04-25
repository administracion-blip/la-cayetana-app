import { NextResponse } from "next/server";
import { createGuestToken } from "@/lib/auth/reservations";
import { sendGuestMagicLinkEmail } from "@/lib/email/reservations-mail";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  findGuestByEmail,
  listReservationsByEmail,
} from "@/lib/repositories/reservations";
import { guestMagicLinkSchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/guest/magic-link`
 *
 * Un cliente sin cuenta introduce su email para recuperar el acceso a
 * las reservas que hizo como guest. Firmamos un JWT nuevo con
 * `sessionVersion` actualizada y devolvemos la URL que abre la app en
 * modo guest.
 *
 * Respuesta neutral: por seguridad SIEMPRE respondemos `{ ok: true }`
 * aunque el email no tenga reservas, para no exponer si un email existe
 * en nuestro sistema. El envío del email real se implementa en PR6 (SES);
 * por ahora loggeamos la URL para poder probar en local.
 */
export async function POST(request: Request) {
  try {
    const ip = extractClientIp(request);
    await enforceRateLimit({
      key: `reservation:guest-link:${ip}`,
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
  const parsed = guestMagicLinkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Email no válido" },
      { status: 400 },
    );
  }

  try {
    const guest = await findGuestByEmail(parsed.data.email);
    if (!guest) {
      // No existe: respondemos neutral. No leak.
      return NextResponse.json({ ok: true });
    }
    // Solo generamos link si el guest tiene alguna reserva (evita abuso
    // de convertir este endpoint en un oráculo de emails).
    const reservations = await listReservationsByEmail(
      guest.emailNormalized,
      { limit: 1 },
    );
    if (reservations.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const token = await createGuestToken({
      guestId: guest.guestId,
      sessionVersion: guest.sessionVersion,
      email: guest.emailNormalized,
    });
    // El envío vive fuera del camino de respuesta para no filtrar latencia
    // que revelara si el email existe o no. `sendGuestMagicLinkEmail` ya
    // loggea el fallo internamente.
    sendGuestMagicLinkEmail({
      toEmail: guest.email,
      name: guest.name,
      guestToken: token,
    }).catch((err) => {
      console.error("[reservations][magic-link][email]", err);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][reservations][guest][magic-link]", err);
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
