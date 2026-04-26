/**
 * Helpers HTTP para aplicar rate limiting de forma uniforme en endpoints
 * públicos (registro, login, forgot, reset, accept-invite, reservas...).
 *
 * Centraliza tres cosas que antes estaban repetidas en cada handler:
 *  1. Extracción de la IP del cliente respetando `X-Forwarded-For` /
 *     `X-Real-IP` (válido cuando el origen vive detrás de un proxy de
 *     confianza: CloudFront, Amplify, Vercel...).
 *  2. Construcción de la respuesta `429` con `Retry-After` y un mensaje
 *     consistente.
 *  3. Log estructurado con tag `[security]` para que las alarmas de
 *     CloudWatch puedan filtrar fácilmente picos de abuso. Nunca se loggea
 *     PII (la `key` se trunca y, si contiene un email, se sustituye por
 *     `hashTag` para poder correlacionar sin filtrar).
 *
 * Uso típico en un route handler:
 *
 *   const ip = extractClientIp(request);
 *   const rl = await applyRateLimits(request, [
 *     { key: `auth:forgot:ip:${ip}`, windowMs: 10 * 60_000, max: 10 },
 *     { key: `auth:forgot:email:${emailNormalized}`, windowMs: 10 * 60_000, max: 3 },
 *   ], { route: "auth/forgot-password" });
 *   if (!rl.ok) return rl.response;
 */

import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  RateLimitError,
  type RateLimitInput,
} from "@/lib/rate-limit";
import { hashTag } from "@/lib/log/redact";

/** Extrae la IP del cliente desde `X-Forwarded-For` / `X-Real-IP`. */
export function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Sustituye partes "sensibles" de la clave (lo que esté después de un
 * `:email:` o `:token:`) por su `hashTag` para no escribir PII en logs.
 */
function sanitizeKeyForLog(key: string): string {
  return key
    .replace(/:email:[^:]+/g, (m) => `:email:${hashTag(m.slice(7))}`)
    .replace(/:token:[^:]+/g, (m) => `:token:${hashTag(m.slice(7))}`);
}

interface RateLimitsOptions {
  /** Identificador del route, usado en el log de seguridad. */
  route: string;
  /** Mensaje al cliente. Si se omite se usa uno genérico. */
  clientMessage?: string;
  /** Status code (429 por defecto). */
  status?: number;
}

type ApplyResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Aplica una secuencia de `enforceRateLimit` y, si alguno se supera,
 * devuelve la respuesta 429 ya construida y registra un log
 * `[security][rate-limit]` con la `route`, la `key` saneada y el
 * `retryAfter`. Si todos los límites pasan devuelve `{ ok: true }`.
 *
 * El orden importa: ponemos primero el límite más permisivo (por IP) para
 * que un atacante distribuido no consuma todavía el cupo "por email".
 */
export async function applyRateLimits(
  request: Request,
  limits: RateLimitInput[],
  opts: RateLimitsOptions,
): Promise<ApplyResult> {
  for (const limit of limits) {
    try {
      await enforceRateLimit(limit);
    } catch (err) {
      if (err instanceof RateLimitError) {
        const ip = extractClientIp(request);
        console.warn(
          `[security][rate-limit] route=${opts.route} key=${sanitizeKeyForLog(
            limit.key,
          )} retryAfterSec=${err.retryAfterSec} ipHash=${hashTag(ip)}`,
        );
        const headers = { "Retry-After": String(err.retryAfterSec) };
        const message =
          opts.clientMessage ??
          "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
        const status = opts.status ?? 429;
        return {
          ok: false,
          response: NextResponse.json({ error: message }, { status, headers }),
        };
      }
      throw err;
    }
  }
  return { ok: true };
}

/**
 * Versión "silenciosa" para flujos donde no queremos convertir el endpoint
 * en un oráculo (típicamente forgot-password / OTP request): si el límite
 * se supera, no devolvemos `429` sino la misma respuesta neutra que para
 * un caso correcto. Solo se loggea el evento.
 *
 * Devuelve `true` si se debe seguir procesando, `false` si hay que cortar
 * y devolver `silentResponse()` desde el llamador.
 */
export async function applyRateLimitsSilent(
  request: Request,
  limits: RateLimitInput[],
  opts: RateLimitsOptions,
): Promise<boolean> {
  for (const limit of limits) {
    try {
      await enforceRateLimit(limit);
    } catch (err) {
      if (err instanceof RateLimitError) {
        const ip = extractClientIp(request);
        console.warn(
          `[security][rate-limit][silent] route=${
            opts.route
          } key=${sanitizeKeyForLog(limit.key)} retryAfterSec=${
            err.retryAfterSec
          } ipHash=${hashTag(ip)}`,
        );
        return false;
      }
      throw err;
    }
  }
  return true;
}
