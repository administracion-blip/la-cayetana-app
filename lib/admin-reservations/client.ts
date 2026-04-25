/**
 * Cliente tipado para la API admin del módulo de reservas. Centraliza
 * el manejo de errores para que los componentes se mantengan limpios.
 */

import type {
  AdminAccessGatesConfigDto,
  AdminMenusConfigDto,
  AdminPrepaymentConfigDto,
  AdminReservationDto,
  AdminSlotsConfigDto,
  ReservationEventDto,
  ReservationMessageDto,
  ReservationNoteDto,
} from "@/lib/serialization/reservations";
import type { ReservationStaffPermissions } from "@/lib/auth/reservation-admin";
import type { ReservationStatus } from "@/types/models";
import type { ReservationForecastPayload } from "@/lib/reservations/forecast-aggregate";

export interface AdminApiError extends Error {
  status: number;
  code?: string;
  extra?: Record<string, unknown>;
}

function asError(
  status: number,
  body: unknown,
  fallback: string,
): AdminApiError {
  const payload =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const err = new Error(
    typeof payload.error === "string" ? (payload.error as string) : fallback,
  ) as AdminApiError;
  err.status = status;
  if (typeof payload.code === "string") err.code = payload.code;
  err.extra = payload;
  return err;
}

async function request<T>(
  input: string,
  init: RequestInit = {},
  fallback = "Error de red",
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (
    init.body &&
    !headers.has("Content-Type") &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(input, { ...init, headers });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw asError(res.status, body, fallback);
  return body as T;
}

export async function adminListReservations(args: {
  status?: ReservationStatus[];
  date?: string;
  q?: string;
  /** Año de la fecha de reserva (calendario). */
  year?: number;
}): Promise<{ reservations: AdminReservationDto[] }> {
  const qs = new URLSearchParams();
  if (args.status) {
    for (const s of args.status) qs.append("status", s);
  }
  if (args.date) qs.set("date", args.date);
  if (args.q) qs.set("q", args.q);
  if (args.year != null) qs.set("year", String(args.year));
  const url = `/api/admin/reservations${qs.size > 0 ? `?${qs.toString()}` : ""}`;
  return request(
    url,
    { method: "GET", cache: "no-store" },
    "No se pudieron listar reservas",
  );
}

export type AdminReservationsSummary = {
  byStatus: Record<ReservationStatus, number>;
  perStatusListCap: number;
};

export async function adminGetReservationsSummary(args?: {
  year?: number;
}): Promise<AdminReservationsSummary> {
  const qs = new URLSearchParams();
  if (args?.year != null) qs.set("year", String(args.year));
  const url = `/api/admin/reservations/summary${
    qs.size > 0 ? `?${qs.toString()}` : ""
  }`;
  return request<AdminReservationsSummary>(
    url,
    { method: "GET", cache: "no-store" },
    "No se pudo cargar el resumen de reservas",
  );
}

export type AdminReservationsForecast = ReservationForecastPayload & {
  statusScope: ReservationStatus[];
};

export async function adminGetReservationsForecast(args: {
  date: string;
}): Promise<AdminReservationsForecast> {
  const qs = new URLSearchParams();
  qs.set("date", args.date);
  return request<AdminReservationsForecast>(
    `/api/admin/reservations/forecast?${qs.toString()}`,
    { method: "GET", cache: "no-store" },
    "No se pudo cargar la previsión",
  );
}

export async function adminFetchReservation(id: string): Promise<{
  reservation: AdminReservationDto;
  messages: ReservationMessageDto[];
  events: ReservationEventDto[];
  notes: ReservationNoteDto[];
  permissions: ReservationStaffPermissions;
}> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}`,
    { method: "GET" },
    "No se pudo obtener la reserva",
  );
}

export async function adminUpdateStatus(
  id: string,
  body: {
    newStatus: ReservationStatus;
    expectedVersion: number;
    systemMessage?: string;
    markPrepaymentReceived?: boolean;
    invalidateGuestSession?: boolean;
  },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/status`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo actualizar el estado",
  );
}

export async function adminUpdateSchedule(
  id: string,
  body: {
    reservationDate: string;
    reservationTime: string;
    expectedVersion: number;
    systemMessage?: string;
  },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/schedule`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo reprogramar",
  );
}

export async function adminUpdateReservationDetails(
  id: string,
  body: {
    contact: { name: string; email: string; phone: string };
    partySize: number;
    reservationDate: string;
    reservationTime: string;
    expectedVersion: number;
    systemMessage?: string;
  },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/details`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo guardar los datos de la reserva",
  );
}

export async function adminSetReservationTable(
  id: string,
  body: { tableLabel: string; expectedVersion: number },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/table`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo asignar la mesa",
  );
}

export async function adminSendMessage(
  id: string,
  body: { body: string; documentIds?: string[] },
): Promise<{ message: ReservationMessageDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo enviar el mensaje",
  );
}

export async function adminAddNote(
  id: string,
  body: { body: string },
): Promise<{ note: ReservationNoteDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/notes`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo añadir la nota",
  );
}

/** Marca señal devuelta (JSON). */
export async function adminUpdatePrepayment(
  id: string,
  body: {
    action: "mark_refunded";
    expectedVersion: number;
  },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/prepayment`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo actualizar el prepago",
  );
}

/** Marca señal recibida con justificante (multipart). */
export async function adminMarkPrepaymentReceived(
  id: string,
  body: {
    expectedVersion: number;
    /** Cada comprobante con su importe en céntimos (mismo orden). */
    lines: { file: File; amountCents: number }[];
  },
): Promise<{ reservation: AdminReservationDto }> {
  if (body.lines.length === 0) {
    throw new Error("Añade al menos un justificante con su importe.");
  }
  const fd = new FormData();
  fd.set("action", "mark_received");
  fd.set("expectedVersion", String(body.expectedVersion));
  fd.set(
    "amountCents",
    JSON.stringify(body.lines.map((l) => l.amountCents)),
  );
  for (const line of body.lines) {
    fd.append("file", line.file);
  }
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/prepayment`,
    { method: "POST", body: fd },
    "No se pudo marcar el prepago como recibido",
  );
}

/** Añade comprobantes a una señal ya recibida. */
export async function adminAppendPrepaymentProofs(
  id: string,
  body: {
    expectedVersion: number;
    lines: { file: File; amountCents: number }[];
  },
): Promise<{ reservation: AdminReservationDto }> {
  if (body.lines.length === 0) {
    throw new Error("Añade al menos un comprobante con su importe.");
  }
  const fd = new FormData();
  fd.set("expectedVersion", String(body.expectedVersion));
  fd.set("amountCents", JSON.stringify(body.lines.map((l) => l.amountCents)));
  for (const line of body.lines) {
    fd.append("file", line.file);
  }
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/prepayment/append`,
    { method: "POST", body: fd },
    "No se pudo añadir los comprobantes",
  );
}

export async function adminRemovePrepaymentProof(
  id: string,
  body: { expectedVersion: number; proofId: string },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(id)}/prepayment/remove`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo eliminar el comprobante",
  );
}

export async function adminGetSlotsConfig(): Promise<{
  config: AdminSlotsConfigDto;
}> {
  return request(
    "/api/admin/reservations/config/slots",
    { method: "GET" },
    "No se pudo cargar la config de slots",
  );
}

export async function adminPutSlotsConfig(
  config: AdminSlotsConfigDto,
): Promise<{ config: AdminSlotsConfigDto }> {
  return request(
    "/api/admin/reservations/config/slots",
    { method: "PUT", body: JSON.stringify(config) },
    "No se pudo guardar la config de slots",
  );
}

export async function adminGetPrepaymentConfig(): Promise<{
  config: AdminPrepaymentConfigDto;
}> {
  return request(
    "/api/admin/reservations/config/prepayment",
    { method: "GET" },
    "No se pudo cargar la config de prepago",
  );
}

export async function adminPutPrepaymentConfig(
  config: AdminPrepaymentConfigDto,
): Promise<{ config: AdminPrepaymentConfigDto }> {
  return request(
    "/api/admin/reservations/config/prepayment",
    { method: "PUT", body: JSON.stringify(config) },
    "No se pudo guardar la config de prepago",
  );
}

export async function adminGetAccessGatesConfig(): Promise<{
  config: AdminAccessGatesConfigDto;
}> {
  return request(
    "/api/admin/reservations/config/access-gates",
    { method: "GET" },
    "No se pudieron cargar los cierres",
  );
}

export async function adminPutAccessGatesConfig(body: {
  carnetPurchaseDeadlineIso?: string;
  tableReservationDeadlineIso?: string;
  loginDeadlineIso?: string;
}): Promise<{ config: AdminAccessGatesConfigDto }> {
  return request(
    "/api/admin/reservations/config/access-gates",
    { method: "PUT", body: JSON.stringify(body) },
    "No se pudieron guardar los cierres",
  );
}

export async function adminGetMenusConfig(): Promise<{
  config: AdminMenusConfigDto;
}> {
  return request(
    "/api/admin/reservations/config/menus",
    { method: "GET" },
    "No se pudo cargar el catálogo de menús",
  );
}

export async function adminUpdateReservationMenus(
  reservationId: string,
  body: {
    expectedVersion: number;
    menuLines: {
      offerId: string;
      quantity: number;
      mainPicks?: string[];
    }[];
  },
): Promise<{ reservation: AdminReservationDto }> {
  return request(
    `/api/admin/reservations/${encodeURIComponent(reservationId)}/menus`,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo actualizar el reparto de menús",
  );
}
