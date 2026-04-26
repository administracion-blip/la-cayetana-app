import type { UserRecord } from "@/types/models";

/**
 * Devuelve el "año de membresía" en curso (UTC, año civil).
 *
 * Mantenemos esto centralizado para que el día que la temporada deje de
 * coincidir con el año civil podamos cambiarlo en un solo sitio.
 */
export function currentMembershipYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

/**
 * `true` si el socio tiene un pago registrado para el año de membresía
 * indicado. La fecha de pago la marca {@link activateUserManually} /
 * {@link activateUserAfterPayment} y también las invitaciones (que
 * fijan `paidAt = now`).
 *
 * Pasamos `now` para que las llamadas en cliente y servidor se puedan
 * sincronizar fácilmente en tests.
 */
export function userHasPaidThisYear(
  user: Pick<UserRecord, "paidAt">,
  now: Date = new Date(),
): boolean {
  if (!user.paidAt) return false;
  const paid = new Date(user.paidAt);
  if (Number.isNaN(paid.getTime())) return false;
  return paid.getUTCFullYear() === currentMembershipYear(now);
}

/**
 * `true` si el socio tiene importe registrado y mayor que 0. Es un guard
 * para entregar el bono: si el importe no se grabó (campo faltante) o es 0
 * (cortesía / invitación), entendemos que no hay cobro asociado y por
 * tanto no hay copas que entregar.
 */
export function userHasPositivePayment(
  user: Pick<UserRecord, "paidAmount">,
): boolean {
  return typeof user.paidAmount === "number" && user.paidAmount > 0;
}

/**
 * Motivo por el que un socio NO puede recibir el bono físico, o `null` si
 * sí puede. Centralizado para que el panel y la API muestren mensajes
 * coherentes.
 */
export type BonoDeliveryBlockReason =
  | "not_active"
  | "not_renewed"
  | "no_payment_amount";

export function bonoDeliveryBlockReason(
  user: Pick<UserRecord, "status" | "paidAt" | "paidAmount">,
  now: Date = new Date(),
): BonoDeliveryBlockReason | null {
  if (user.status !== "active") return "not_active";
  if (!userHasPaidThisYear(user, now)) return "not_renewed";
  if (!userHasPositivePayment(user)) return "no_payment_amount";
  return null;
}

/**
 * Texto corto para mostrar en UI explicando por qué no se puede entregar
 * el bono. Útil para la ficha del socio y la columna Entrega.
 */
export function bonoDeliveryBlockMessage(
  reason: BonoDeliveryBlockReason,
): string {
  switch (reason) {
    case "not_active":
      return "El socio no está activo.";
    case "not_renewed":
      return "El socio no ha renovado este año. Renueva primero.";
    case "no_payment_amount":
      return "El pago no tiene importe registrado. Edita el importe (o renueva con el cobro) antes de entregar el bono.";
  }
}

/**
 * Regla canónica para entregar el bono físico:
 *  - Socio activo.
 *  - `paidAt` cae en el año de membresía actual (renovación al día).
 *  - `paidAmount > 0` (hay un cobro asociado a esta cuota).
 *
 * Cuando un socio renueva el año siguiente, la activación manual (o el
 * webhook automático) actualiza `paidAt` y reabre `deliveryStatus = "pending"`,
 * así que vuelve a cumplirse la regla y puede recibir su bono nuevo.
 *
 * Las invitaciones gratuitas (cortesía, `paidAmount = 0`) no cumplen la
 * regla a propósito: si después se cobra, el admin debe registrar el
 * importe (renovación con cobro o edición) y entonces sí podrá entregar.
 */
export function userCanReceiveBonoDelivery(
  user: Pick<UserRecord, "status" | "paidAt" | "paidAmount">,
  now: Date = new Date(),
): boolean {
  return bonoDeliveryBlockReason(user, now) === null;
}
