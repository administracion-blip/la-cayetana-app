/**
 * Emails transaccionales del módulo de Reservas.
 *
 * Todos envían texto plano a través de `sendSesPlainTextEmail`. Si
 * `SES_FROM_EMAIL` no está configurado el envío se loggea pero no rompe
 * la operación principal (tal y como hace `transactional.ts`). Los
 * emails al staff se mandan a `RESERVATIONS_STAFF_ALERT_EMAIL`
 * (opcional; admite lista separada por comas).
 */

import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";
import { getEnv } from "@/lib/env";
import type {
  ReservationRecord,
  ReservationStatus,
} from "@/types/models";

function appBaseUrl(): string {
  return getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

function staffAlertRecipients(): string[] {
  let raw: string | undefined;
  try {
    raw = getEnv().RESERVATIONS_STAFF_ALERT_EMAIL;
  } catch {
    raw = undefined;
  }
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatSpanishDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  try {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Madrid",
    }).format(dt);
  } catch {
    return isoDate;
  }
}

/**
 * Enlace que abre la app con el `guestToken` ya inyectado en la URL.
 * La home `/reservas` lo lee del query string, lo guarda en
 * localStorage y limpia la URL.
 */
export function buildGuestManageUrl(guestToken: string): string {
  return `${appBaseUrl()}/reservas?gt=${encodeURIComponent(guestToken)}`;
}

/**
 * Envía un código OTP de 6 dígitos para que el guest recupere acceso
 * a sus reservas sin necesidad de abrir un magic link. Más rápido que
 * el flujo de enlace y resistente a emails que van a spam / preview
 * (basta con ver el asunto).
 */
export async function sendGuestOtpEmail(input: {
  toEmail: string;
  code: string;
  ttlMinutes: number;
}): Promise<boolean> {
  const body = [
    "Hola,",
    "",
    "Introduce este código para volver a acceder a tus reservas en La Cayetana:",
    "",
    `      ${input.code}`,
    "",
    `El código es de un solo uso y caduca en ${input.ttlMinutes} minutos.`,
    "Si no lo has solicitado, ignora este mensaje.",
    "",
    "— La Cayetana · Granada",
  ].join("\n");

  const result = await sendSesPlainTextEmail({
    to: input.toEmail,
    subject: `${input.code} · Tu código para La Cayetana`,
    body,
  });
  return result.ok;
}

export async function sendGuestMagicLinkEmail(input: {
  toEmail: string;
  name: string;
  guestToken: string;
  /** Si se pasa, incluye detalles de la reserva recién creada. */
  reservation?: {
    reservationDate: string;
    reservationTime: string;
    partySize: number;
  };
}): Promise<boolean> {
  const url = buildGuestManageUrl(input.guestToken);

  const lines: string[] = [
    `Hola ${input.name.trim() || "invitado"},`,
    "",
  ];
  if (input.reservation) {
    lines.push(
      "Hemos recibido tu solicitud de reserva en La Cayetana:",
      "",
      `· Fecha: ${formatSpanishDate(input.reservation.reservationDate)}`,
      `· Hora: ${input.reservation.reservationTime} h`,
      `· Comensales: ${input.reservation.partySize}`,
      "",
      "Puedes ver su estado, hablar con nosotros por chat y gestionarla desde:",
    );
  } else {
    lines.push(
      "Aquí tienes tu enlace para gestionar tus reservas en La Cayetana.",
      "",
      "Ábrelo desde cualquier dispositivo:",
    );
  }
  lines.push(
    "",
    url,
    "",
    "El enlace es válido durante 30 días. Si cambiamos algún dato importante de la reserva recibirás uno nuevo.",
    "",
    "— La Cayetana · Granada",
  );

  const result = await sendSesPlainTextEmail({
    to: input.toEmail,
    subject: input.reservation
      ? "Tu reserva en La Cayetana"
      : "Tu enlace para gestionar reservas en La Cayetana",
    body: lines.join("\n"),
  });
  return result.ok;
}

export async function sendStaffNewReservationAlertEmail(input: {
  reservation: ReservationRecord;
}): Promise<boolean> {
  const recipients = staffAlertRecipients();
  if (recipients.length === 0) {
    console.warn(
      "[reservations-mail] staff alert skipped: no RESERVATIONS_STAFF_ALERT_EMAIL configured",
    );
    return false;
  }
  const r = input.reservation;
  const url = `${appBaseUrl()}/admin/reservas/${r.reservationId}`;

  const body = [
    "Nueva reserva recibida en La Cayetana:",
    "",
    `· Fecha: ${formatSpanishDate(r.reservationDate)} · ${r.reservationTime} h`,
    `· Comensales: ${r.partySize}`,
    `· Contacto: ${r.contact.name} · ${r.contact.email} · ${r.contact.phone}`,
    r.notes ? `· Nota del cliente: ${r.notes}` : null,
    r.guestId ? "· Cliente: guest (sin cuenta)" : "· Cliente: socio",
    r.prepaymentAmountCents
      ? `· Señal requerida: ${(r.prepaymentAmountCents / 100).toFixed(2)} €`
      : null,
    "",
    `Revísala y gestiónala en: ${url}`,
    "",
    "— Aviso automático de reservas",
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");

  let allOk = true;
  for (const to of recipients) {
    const result = await sendSesPlainTextEmail({
      to,
      subject: `Nueva reserva · ${r.contact.name} · ${r.reservationDate} ${r.reservationTime}`,
      body,
    });
    if (!result.ok) allOk = false;
  }
  return allOk;
}

export async function sendReservationScheduleChangedEmail(input: {
  reservation: ReservationRecord;
  previous: { reservationDate: string; reservationTime: string };
  guestToken?: string;
  customMessage?: string;
}): Promise<boolean> {
  const r = input.reservation;
  const url = input.guestToken
    ? buildGuestManageUrl(input.guestToken)
    : `${appBaseUrl()}/reservas`;

  const body = [
    `Hola ${r.contact.name.trim()},`,
    "",
    "Hemos modificado la fecha u hora de tu reserva en La Cayetana. Revisa los nuevos datos:",
    "",
    `· Antes: ${formatSpanishDate(input.previous.reservationDate)} · ${input.previous.reservationTime} h`,
    `· Ahora: ${formatSpanishDate(r.reservationDate)} · ${r.reservationTime} h`,
    `· Comensales: ${r.partySize}`,
    input.customMessage ? "" : null,
    input.customMessage ? `"${input.customMessage}"` : null,
    "",
    `Accede al chat y confirma desde: ${url}`,
    "",
    "— La Cayetana · Granada",
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");

  const result = await sendSesPlainTextEmail({
    to: r.contact.email,
    subject: "Actualización de tu reserva · La Cayetana",
    body,
  });
  return result.ok;
}

const CUSTOMER_NOTIFIABLE_STATUSES: ReservationStatus[] = [
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
  "cancelled_by_staff",
];

/**
 * Avisa al cliente por email cuando el staff cambia el estado a uno
 * "significativo" (confirmación, cancelación, petición de señal, etc.).
 * No se envían emails para cambios intermedios como `pending` o `no_show`.
 *
 * `guestToken` sólo se pasa si la reserva es de guest y acabamos de
 * emitir un token nuevo (p. ej. tras `bumpGuestSessionVersion`). En ese
 * caso lo incluimos como enlace directo para gestionar la reserva.
 */
export async function sendCustomerStatusChangedEmail(input: {
  reservation: ReservationRecord;
  newStatus: ReservationStatus;
  guestToken?: string;
  customMessage?: string;
}): Promise<boolean> {
  if (!CUSTOMER_NOTIFIABLE_STATUSES.includes(input.newStatus)) {
    return false;
  }
  const r = input.reservation;
  const url = input.guestToken
    ? buildGuestManageUrl(input.guestToken)
    : `${appBaseUrl()}/reservas`;

  const copyByStatus: Record<string, { subject: string; intro: string }> = {
    awaiting_customer: {
      subject: "Necesitamos tu confirmación · La Cayetana",
      intro:
        "Hemos revisado tu reserva y necesitamos que confirmes unos últimos detalles:",
    },
    awaiting_prepayment: {
      subject: "Tu reserva está pendiente de señal · La Cayetana",
      intro:
        "Tu reserva está casi lista. Solo falta la señal para confirmarla. Te hemos dejado los datos de la transferencia en la pantalla de tu reserva.",
    },
    confirmed: {
      subject: "Tu reserva está confirmada · La Cayetana",
      intro: "¡Todo listo! Tu reserva ha quedado confirmada.",
    },
    cancelled_by_staff: {
      subject: "Tu reserva ha sido cancelada · La Cayetana",
      intro:
        "Lo sentimos, hemos tenido que cancelar tu reserva. Si quieres reprogramarla contáctanos por este mismo chat.",
    },
  };
  const copy = copyByStatus[input.newStatus];
  if (!copy) return false;

  const body = [
    `Hola ${r.contact.name.trim()},`,
    "",
    copy.intro,
    "",
    `· Fecha: ${formatSpanishDate(r.reservationDate)}`,
    `· Hora: ${r.reservationTime} h`,
    `· Comensales: ${r.partySize}`,
    input.customMessage ? "" : null,
    input.customMessage ? `"${input.customMessage}"` : null,
    "",
    `Gestiona tu reserva en: ${url}`,
    "",
    "— La Cayetana · Granada",
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");

  const result = await sendSesPlainTextEmail({
    to: r.contact.email,
    subject: copy.subject,
    body,
  });
  return result.ok;
}
