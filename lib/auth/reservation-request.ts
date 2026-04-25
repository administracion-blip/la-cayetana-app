/**
 * Helpers para resolver la identidad del cliente que llama a la API de
 * reservas. Soporta dos fuentes:
 *
 *  - Socio logueado: cookie `lc_session` (gestionada por `lib/auth/session`).
 *  - Guest: token JWT en la cabecera `Authorization: Bearer <token>` o en
 *    el query string `?gt=<token>` (útil para magic links).
 *
 * La función principal es `resolveReservationRequester(request)`, que
 * devuelve un union discriminado con los datos ya cargados de Dynamo.
 * Si el guest token caducó o `sessionVersion` no coincide, devuelve
 * `{ kind: "guest_invalid" }` para que el endpoint responda con 401.
 */

import { getGuestTokenFromRequest } from "@/lib/auth/guest-cookie";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  isGuestSessionStillValid,
  verifyGuestToken,
} from "@/lib/auth/reservations";
import { getGuestById } from "@/lib/repositories/reservations";
import { getUserById } from "@/lib/repositories/users";
import type { GuestRecord, UserRecord } from "@/types/models";

export type ReservationRequester =
  | {
      kind: "user";
      user: UserRecord;
    }
  | {
      kind: "guest";
      guest: GuestRecord;
      token: string;
    }
  | { kind: "guest_invalid" }
  | { kind: "anonymous" };

/**
 * Extrae el guest token. Orden de preferencia:
 *
 *  1. Cookie httpOnly `lc_guest_session` (PR-3.1, formato preferido).
 *  2. Cabecera `Authorization: Bearer <t>` (compat con clientes en
 *     localStorage hasta que la migración cookie esté terminada).
 *  3. Query `?gt=` (sólo lo usa el magic-link landing antes de que el
 *     middleware lo haya consumido y movido a cookie).
 *
 * Cuando hay cookie, se ignoran Authorization/`?gt=` para evitar que un
 * atacante que controle un sub-recurso embebido inyecte un token distinto
 * en cabeceras o query.
 */
export function extractGuestToken(request: Request): string | null {
  const cookieToken = getGuestTokenFromRequest(request);
  if (cookieToken) return cookieToken;

  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  try {
    const url = new URL(request.url);
    const gt = url.searchParams.get("gt");
    if (gt) return gt;
  } catch {
    // Si la URL no es parseable simplemente no hay token; no es crítico.
  }
  return null;
}

/**
 * Resuelve el identificador del requester. Preferencia: cookie de socio
 * logueado; si no hay, guest token. Si ambos faltan, `anonymous` (algunos
 * endpoints como `POST /api/reservations` lo permiten para crear como
 * guest, otros deberán responder 401 explícitamente).
 */
export async function resolveReservationRequester(
  request: Request,
): Promise<ReservationRequester> {
  const session = await getSessionFromCookies();
  if (session) {
    const user = await getUserById(session.sub);
    if (user && user.status !== "pending_payment") {
      return { kind: "user", user };
    }
  }

  const token = extractGuestToken(request);
  if (!token) return { kind: "anonymous" };
  const payload = await verifyGuestToken(token);
  if (!payload) return { kind: "guest_invalid" };
  const guest = await getGuestById(payload.sub);
  if (!guest) return { kind: "guest_invalid" };
  if (!isGuestSessionStillValid(payload, guest.sessionVersion)) {
    return { kind: "guest_invalid" };
  }
  return { kind: "guest", guest, token };
}

/** Helper para tests/endpoints: devuelve `userId | guestId` o `null`. */
export function identityIdsFromRequester(req: ReservationRequester): {
  userId: string | null;
  guestId: string | null;
} {
  if (req.kind === "user") return { userId: req.user.id, guestId: null };
  if (req.kind === "guest") return { userId: null, guestId: req.guest.guestId };
  return { userId: null, guestId: null };
}

/** Devuelve `true` si el requester es dueño de la reserva indicada. */
export function isOwnerOfReservation(
  req: ReservationRequester,
  reservation: { userId: string | null; guestId: string | null },
): boolean {
  if (req.kind === "user") {
    return reservation.userId === req.user.id;
  }
  if (req.kind === "guest") {
    return reservation.guestId === req.guest.guestId;
  }
  return false;
}
