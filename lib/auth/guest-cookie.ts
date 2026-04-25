/**
 * Helpers para gestionar la cookie de sesión de guest.
 *
 * El guestToken (JWT firmado con `SESSION_SECRET`) viaja, a partir de
 * PR-3.1, en una cookie httpOnly llamada `lc_guest_session`. Antes vivía
 * en `localStorage` y se enviaba como `Authorization: Bearer <t>`. La
 * migración es **dual** durante la transición:
 *
 *  - El servidor sigue aceptando `Authorization: Bearer` y `?gt=` además
 *    de la cookie. La cookie tiene preferencia.
 *  - El cliente sigue escribiendo en `localStorage` por compat (lo
 *    desactivaremos cuando el rollout cookie esté completo).
 *
 * Atributos de la cookie:
 *  - `httpOnly`: el JS no puede leerla → blindaje contra XSS.
 *  - `Secure` en producción: solo viaja por HTTPS.
 *  - `SameSite=Lax`: el navegador la envía en navegación top-level GET
 *    (necesario para que el magic link funcione viniendo de Gmail) pero
 *    NO en mutaciones cross-origin (mitiga CSRF clásico de formularios).
 *  - `Path=/`: la app la necesita en `/reservas/...` y `/api/reservations/...`.
 *  - `Max-Age = 30d`: mismo TTL que el JWT actual.
 */

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const GUEST_COOKIE_NAME = "lc_guest_session";

/** TTL de la cookie en segundos (30 días, igual que el JWT). */
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

interface GuestCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

function options(): GuestCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  };
}

/**
 * Setea la cookie de guest sobre una `NextResponse` ya creada (típico
 * de un route handler que está a punto de devolver `return res`).
 */
export function setGuestCookieOnResponse(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(GUEST_COOKIE_NAME, token, options());
}

/**
 * Borra la cookie de guest sobre una `NextResponse`. Útil tras un logout
 * o tras detectar token caducado/inválido en el servidor.
 */
export function clearGuestCookieOnResponse(response: NextResponse): void {
  response.cookies.set(GUEST_COOKIE_NAME, "", {
    ...options(),
    maxAge: 0,
  });
}

/**
 * Lee la cookie desde el contexto de un Server Component / Route Handler
 * (vía `next/headers`). Devuelve `null` si no existe o si el cookie store
 * no está disponible (en algunos entornos de test, etc.).
 */
export async function getGuestTokenFromCookies(): Promise<string | null> {
  try {
    const store = await cookies();
    const c = store.get(GUEST_COOKIE_NAME);
    return c?.value || null;
  } catch {
    return null;
  }
}

/**
 * Lee la cookie desde un objeto `Request` (Web Request estándar). Útil
 * en route handlers que reciben `request: Request` y no quieren ir al
 * `cookies()` global.
 *
 * Se hace un parseo manual sencillo del header `cookie` para evitar una
 * dependencia adicional. El formato de la cookie no contiene `;` ni `=`
 * dentro del valor (es un JWT base64url).
 */
export function getGuestTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== GUEST_COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    return value || null;
  }
  return null;
}
