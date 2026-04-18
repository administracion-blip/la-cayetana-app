/** Contador atómico de carnets en la tabla de usuarios */
export const MEMBERSHIP_COUNTER_ID = "SYSTEM_MEMBERSHIP_COUNTER";

export function emailLockId(normalizedEmail: string): string {
  return `LOCK_EMAIL#${normalizedEmail}`;
}

export function stripeSessionLockId(sessionId: string): string {
  return `LOCK_STRIPE#${sessionId}`;
}

/** Registro de pago completado (antes de activar cuenta con contraseña). */
export function paidSessionRecordId(sessionId: string): string {
  return `PAID_SESSION#${sessionId}`;
}

export function formatMembershipId(seq: number): string {
  if (seq < 1 || seq > 9999) {
    throw new Error("Límite de socios alcanzado (CY0001–CY9999)");
  }
  return `CY${String(seq).padStart(4, "0")}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
