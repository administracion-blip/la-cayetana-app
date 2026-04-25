/**
 * Sesiones de "guest" para el módulo de reservas (clientes sin cuenta).
 *
 * Flujo:
 *  1. El guest introduce email + teléfono al hacer la primera reserva.
 *  2. Creamos/encontramos `GuestRecord` por `normalizeEmail`.
 *  3. Al terminar la reserva enviamos un email con un "magic link" que
 *     contiene un JWT firmado con `guestId + sessionVersion`.
 *  4. Ese link permite ver y gestionar **cualquier reserva** asociada a
 *     ese `guestId` durante 30 días.
 *  5. Si staff modifica datos relevantes de una reserva (fecha, hora,
 *     estado significativo) bumpamos `sessionVersion` del guest → el link
 *     antiguo deja de funcionar y el cliente recibe un nuevo magic link.
 *
 * Además de la sesión, este archivo expone helpers puros para comprobar
 * permisos de staff sobre reservas (`canManageReservations`, etc.).
 */

import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";
import type { UserRecord } from "@/types/models";

const GUEST_TOKEN_TTL = "30d";
const GUEST_TOKEN_ISSUER = "lacayetana.reservations.guest";

export interface GuestSessionPayload {
  /** `sub` = guestId. */
  sub: string;
  /** `sv` = sessionVersion al firmar. Debe coincidir con el GuestRecord. */
  sv: number;
  /** `em` = email normalizado (para auditoría, no se vuelve a confiar en él). */
  em: string;
}

function getKey(): Uint8Array {
  const { SESSION_SECRET } = getEnv();
  return new TextEncoder().encode(SESSION_SECRET);
}

/**
 * Firma un token JWT para el guest. El token viaja en la URL del magic
 * link y, al llegar a `/reservas`, el middleware lo mueve a una cookie
 * httpOnly `lc_guest_session` (ver `lib/auth/guest-cookie.ts`). Mientras
 * dure la migración el cliente legacy también lo guarda en `localStorage`
 * y lo manda como `Authorization: Bearer`; el servidor prefiere la cookie.
 */
export async function createGuestToken(payload: {
  guestId: string;
  sessionVersion: number;
  email: string;
}): Promise<string> {
  return new SignJWT({ sv: payload.sessionVersion, em: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.guestId)
    .setIssuer(GUEST_TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(GUEST_TOKEN_TTL)
    .sign(getKey());
}

/**
 * Verifica la firma y caducidad del token. No verifica que
 * `sessionVersion` siga vigente: eso debe comprobarse contra el
 * `GuestRecord` actual (ver `verifyGuestSessionAgainstRecord`).
 */
export async function verifyGuestToken(
  token: string,
): Promise<GuestSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      issuer: GUEST_TOKEN_ISSUER,
    });
    const sub = payload.sub;
    const sv = typeof payload.sv === "number" ? payload.sv : null;
    const em = typeof payload.em === "string" ? payload.em : null;
    if (!sub || sv === null || em === null) return null;
    return { sub, sv, em };
  } catch {
    return null;
  }
}

/**
 * Comprueba que la `sessionVersion` del token coincida con la actual del
 * `GuestRecord`. Si no coincide el link ha sido invalidado (staff cambió
 * datos relevantes de una reserva del guest).
 */
export function isGuestSessionStillValid(
  tokenPayload: GuestSessionPayload,
  currentSessionVersion: number,
): boolean {
  return tokenPayload.sv === currentSessionVersion;
}

// ── Permisos de staff ─────────────────────────────────────────────────────

/**
 * Devuelve `true` si `user` es staff (usuario administrador o con permiso
 * de reservas) y puede ver el tablero / abrir cualquier reserva. Los
 * permisos granulares posteriores se consultan con los helpers específicos
 * de abajo. Un socio normal nunca es staff.
 */
export function userIsReservationStaff(
  user: Pick<UserRecord, "isAdmin" | "canManageReservations">,
): boolean {
  return !!user.isAdmin || !!user.canManageReservations;
}

export function userCanManageReservations(
  user: Pick<UserRecord, "isAdmin" | "canManageReservations">,
): boolean {
  return !!user.isAdmin || !!user.canManageReservations;
}

export function userCanReplyReservationChats(
  user: Pick<UserRecord, "isAdmin" | "canReplyReservationChats">,
): boolean {
  return !!user.isAdmin || !!user.canReplyReservationChats;
}

export function userCanEditReservationConfig(
  user: Pick<UserRecord, "isAdmin" | "canEditReservationConfig">,
): boolean {
  return !!user.isAdmin || !!user.canEditReservationConfig;
}

export function userCanManageReservationDocuments(
  user: Pick<UserRecord, "isAdmin" | "canManageReservationDocuments">,
): boolean {
  return !!user.isAdmin || !!user.canManageReservationDocuments;
}

export function userCanWriteReservationNotes(
  user: Pick<UserRecord, "isAdmin" | "canWriteReservationNotes">,
): boolean {
  return !!user.isAdmin || !!user.canWriteReservationNotes;
}
