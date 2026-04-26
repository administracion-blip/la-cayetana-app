/** Contador atómico de carnets en la tabla de usuarios */
export const MEMBERSHIP_COUNTER_ID = "SYSTEM_MEMBERSHIP_COUNTER";

/**
 * Duración del preregistro pendiente de pago antes de expirar.
 *
 * Se ha bajado a 30 min para reducir la fricción cuando el usuario aborta el
 * pago en Stripe (refresh, sin conexión, cierra pestaña…). Si vuelve a
 * `/registro` con el mismo email + misma contraseña, el endpoint
 * `registration/start` "reanuda" el draft y le devuelve el Payment Link en
 * lugar de bloquear el correo durante 24 h. Pasados los 30 min, el draft se
 * considera caducado y la siguiente alta lo sobreescribe.
 */
export const PENDING_USER_TTL_SECONDS = 60 * 30;

export function emailLockId(normalizedEmail: string): string {
  return `LOCK_EMAIL#${normalizedEmail}`;
}

export function stripeSessionLockId(sessionId: string): string {
  return `LOCK_STRIPE#${sessionId}`;
}

/** Rango reservado para alta masiva de socios de años anteriores. */
export const LEGACY_MIN_SEQ = 1;
export const LEGACY_MAX_SEQ = 999;
/** Primer membershipId asignado por Stripe (los < 1000 son legacy). */
export const STRIPE_MIN_SEQ = 1000;
export const MEMBERSHIP_MAX_SEQ = 9999;

export function formatMembershipId(seq: number): string {
  if (seq < LEGACY_MIN_SEQ || seq > MEMBERSHIP_MAX_SEQ) {
    throw new Error("Límite de socios alcanzado (CY0001–CY9999)");
  }
  return `CY${String(seq).padStart(4, "0")}`;
}

/**
 * Intenta parsear un membershipId con formato `CYxxxx`.
 * Devuelve el número de secuencia o `null` si no es válido.
 */
export function parseMembershipId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).trim().toUpperCase().match(/^CY(\d{4})$/);
  if (!m) return null;
  const seq = Number(m[1]);
  if (!Number.isFinite(seq)) return null;
  if (seq < LEGACY_MIN_SEQ || seq > MEMBERSHIP_MAX_SEQ) return null;
  return seq;
}

export function isLegacyMembershipSeq(seq: number): boolean {
  return seq >= LEGACY_MIN_SEQ && seq <= LEGACY_MAX_SEQ;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
