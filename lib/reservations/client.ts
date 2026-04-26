/**
 * Cliente tipado para la API de reservas. Centraliza:
 *  - Inyección del guest token en cada request.
 *  - Parsing de errores → mensajes listos para mostrar.
 *  - Almacenamiento del guest token devuelto por `POST /reservations`.
 *
 * Todo se ejecuta en el cliente (`"use client"` en quien lo llame).
 */

import {
  authHeadersForGuest,
  setStoredGuestEmail,
  setStoredGuestToken,
} from "@/lib/reservations/guest-token-store";
import type {
  ReservationConfigDto,
  ReservationDocumentDto,
  ReservationDto,
  ReservationEventDto,
  ReservationMessageDto,
  SlotDayDto,
} from "@/lib/serialization/reservations";

export interface ReservationsApiError extends Error {
  status: number;
  code?: string;
  extra?: Record<string, unknown>;
}

function toApiError(
  status: number,
  body: unknown,
  fallback: string,
): ReservationsApiError {
  const payload =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const err = new Error(
    typeof payload.error === "string" ? (payload.error as string) : fallback,
  ) as ReservationsApiError;
  err.status = status;
  if (typeof payload.code === "string") err.code = payload.code;
  err.extra = payload;
  return err;
}

async function request<T>(
  input: string,
  init: RequestInit = {},
  fallbackError = "Error de red",
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  for (const [k, v] of Object.entries(authHeadersForGuest())) {
    if (!headers.has(k)) headers.set(k, v as string);
  }
  const res = await fetch(input, { ...init, headers });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw toApiError(res.status, body, fallbackError);
  return body as T;
}

export async function fetchReservationConfig(): Promise<ReservationConfigDto> {
  return request<ReservationConfigDto>(
    "/api/reservations/config",
    { method: "GET" },
    "No se pudo cargar la configuración",
  );
}

export async function fetchSlotsForDate(date: string): Promise<SlotDayDto> {
  return request<SlotDayDto>(
    `/api/reservations/slots?date=${encodeURIComponent(date)}`,
    { method: "GET" },
    "No se pudieron cargar los slots",
  );
}

export interface MyReservationsResponse {
  active: ReservationDto[];
  past: ReservationDto[];
  anonymous?: boolean;
}

export async function fetchMyReservations(): Promise<MyReservationsResponse> {
  return request<MyReservationsResponse>(
    "/api/reservations/me",
    { method: "GET" },
    "No se pudieron cargar tus reservas",
  );
}

export async function fetchReservationDetail(id: string): Promise<{
  reservation: ReservationDto;
  messages: ReservationMessageDto[];
  events: ReservationEventDto[];
}> {
  return request(
    `/api/reservations/${encodeURIComponent(id)}`,
    { method: "GET" },
    "No se pudo cargar la reserva",
  );
}

export interface CreateReservationArgs {
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  menuLines: {
    offerId: string;
    quantity: number;
    mainPicks?: string[];
  }[];
  notes?: string;
  contact?: { name: string; email: string; phone: string };
  /** Token de Cloudflare Turnstile para guests; ignorado si está vacío. */
  captchaToken?: string | null;
}

export async function createReservation(args: CreateReservationArgs): Promise<{
  reservation: ReservationDto;
  guestToken?: string;
  guestId?: string;
}> {
  const data = await request<{
    reservation: ReservationDto;
    guestToken?: string;
    guestId?: string;
  }>(
    "/api/reservations",
    { method: "POST", body: JSON.stringify(args) },
    "No se pudo crear la reserva",
  );
  if (data.guestToken) setStoredGuestToken(data.guestToken);
  if (data.guestId && data.reservation.contact?.email) {
    setStoredGuestEmail(data.reservation.contact.email);
  }
  return data;
}

export async function sendReservationMessage(
  reservationId: string,
  body: string,
  documentIds?: string[],
): Promise<{ message: ReservationMessageDto }> {
  return request(
    `/api/reservations/${encodeURIComponent(reservationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body, documentIds }),
    },
    "No se pudo enviar el mensaje",
  );
}

export async function markReservationRead(reservationId: string): Promise<void> {
  await request<{ ok: true }>(
    `/api/reservations/${encodeURIComponent(reservationId)}/read`,
    { method: "POST" },
    "No se pudo marcar como leída",
  );
}

export async function cancelReservation(
  reservationId: string,
  reason?: string,
): Promise<{ reservation: ReservationDto }> {
  return request(
    `/api/reservations/${encodeURIComponent(reservationId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    },
    "No se pudo cancelar la reserva",
  );
}

export async function acceptReservation(
  reservationId: string,
): Promise<{ reservation: ReservationDto }> {
  return request(
    `/api/reservations/${encodeURIComponent(reservationId)}/accept`,
    { method: "POST" },
    "No se pudo confirmar la reserva",
  );
}

export async function fetchReservationDocuments(): Promise<{
  documents: ReservationDocumentDto[];
}> {
  return request(
    "/api/reservations/documents",
    { method: "GET" },
    "No se pudieron cargar los documentos",
  );
}

export async function requestGuestMagicLink(email: string): Promise<void> {
  await request<{ ok: true }>(
    "/api/reservations/guest/magic-link",
    { method: "POST", body: JSON.stringify({ email }) },
    "No se pudo enviar el enlace",
  );
}

export async function requestGuestOtp(email: string): Promise<void> {
  await request<{ ok: true }>(
    "/api/reservations/guest/otp/request",
    { method: "POST", body: JSON.stringify({ email }) },
    "No se pudo enviar el código",
  );
}

export interface VerifyGuestOtpResponse {
  ok: true;
  guestToken: string;
  guestId: string;
  email: string;
  name: string;
}

export async function verifyGuestOtp(
  email: string,
  code: string,
): Promise<VerifyGuestOtpResponse> {
  const data = await request<VerifyGuestOtpResponse>(
    "/api/reservations/guest/otp/verify",
    { method: "POST", body: JSON.stringify({ email, code }) },
    "No se pudo verificar el código",
  );
  if (data.guestToken) setStoredGuestToken(data.guestToken);
  if (data.email) setStoredGuestEmail(data.email);
  return data;
}
