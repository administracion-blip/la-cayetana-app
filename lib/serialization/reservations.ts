/**
 * Serializadores para convertir registros Dynamo del módulo de reservas
 * en DTOs limpios para el cliente. Nunca enviamos `PK`, `SK`, `GSI*` ni
 * campos internos como `version` — aunque el cliente necesita `version`
 * para el optimistic concurrency en updates, por eso sí lo devolvemos.
 */

import { mainCoursesForClientDisplay } from "@/lib/reservation-menus-helpers";
import { buildPrepaymentConcept } from "@/lib/prepayment-concept";
import type {
  GuestRecord,
  ReservationDocumentRecord,
  ReservationEventRecord,
  ReservationMessageRecord,
  ReservationRecord,
  ReservationStatus,
  ReservationSlotDay,
  ReservationConfigSlotsRecord,
  ReservationConfigPrepaymentRecord,
  ReservationConfigAccessGatesRecord,
  ReservationConfigMenusRecord,
  ReservationMenuLineItem,
  ReservationMenuOffer,
} from "@/types/models";

export interface AdminPrepaymentProofItemDto {
  proofId: string;
  fileName: string;
  amountCents: number;
}

function adminPrepaymentProofDtosFromRecord(
  r: ReservationRecord,
): AdminPrepaymentProofItemDto[] {
  if (r.prepaymentProofItems && r.prepaymentProofItems.length > 0) {
    return r.prepaymentProofItems.map((p) => ({
      proofId: p.proofId,
      fileName: p.fileName,
      amountCents: p.amountCents,
    }));
  }
  if (r.prepaymentProofS3Key) {
    return [
      {
        proofId: "legacy",
        fileName: r.prepaymentProofFileName ?? "justificante",
        amountCents: 0,
      },
    ];
  }
  return [];
}

export interface ReservationMenuLineItemDto {
  offerId: string;
  quantity: number;
  nameSnapshot: string;
  priceCents: number;
  mainCoursesSnapshot: string[];
}

export interface ReservationDto {
  reservationId: string;
  status: ReservationStatus;
  prepaymentStatus: ReservationRecord["prepaymentStatus"];
  prepaymentAmountCents?: number;
  prepaymentDeadlineAt?: string;
  prepaymentInstructions?: string;
  reservationDate: string;
  reservationTime: string;
  reservationStartAtIso: string;
  partySize: number;
  notes?: string;
  menuLineItems: ReservationMenuLineItemDto[];
  contact: ReservationRecord["contact"];
  isGuest: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  unreadForCustomer: number;
  lastMessageAt?: string;
}

function serializeMenuLineItems(
  items: ReservationMenuLineItem[] | undefined,
): ReservationMenuLineItemDto[] {
  if (!items?.length) return [];
  return items.map((i) => ({
    offerId: i.offerId,
    quantity: i.quantity,
    nameSnapshot: i.nameSnapshot,
    priceCents: i.priceCents,
    mainCoursesSnapshot: i.mainCoursesSnapshot,
  }));
}

export function serializeReservation(r: ReservationRecord): ReservationDto {
  return {
    reservationId: r.reservationId,
    status: r.status,
    prepaymentStatus: r.prepaymentStatus,
    prepaymentAmountCents: r.prepaymentAmountCents,
    prepaymentDeadlineAt: r.prepaymentDeadlineAt,
    prepaymentInstructions: r.prepaymentInstructions,
    reservationDate: r.reservationDate,
    reservationTime: r.reservationTime,
    reservationStartAtIso: r.reservationStartAtIso,
    partySize: r.partySize,
    notes: r.notes,
    menuLineItems: serializeMenuLineItems(r.menuLineItems),
    contact: r.contact,
    isGuest: !!r.guestId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
    unreadForCustomer: r.unreadForCustomer,
    lastMessageAt: r.lastMessageAt,
  };
}

export interface ReservationMessageDto {
  messageId: string;
  authorType: ReservationMessageRecord["authorType"];
  authorDisplayName: string;
  body: string;
  createdAt: string;
  documentIds?: string[];
}

export function serializeReservationMessage(
  m: ReservationMessageRecord,
): ReservationMessageDto {
  return {
    messageId: m.messageId,
    authorType: m.authorType,
    authorDisplayName: m.authorDisplayName,
    body: m.body,
    createdAt: m.createdAt,
    documentIds: m.documentIds,
  };
}

export interface ReservationEventDto {
  eventId: string;
  kind: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export function serializeReservationEvent(
  e: ReservationEventRecord,
): ReservationEventDto {
  return {
    eventId: e.eventId,
    kind: e.kind,
    createdAt: e.createdAt,
    meta: e.meta,
  };
}

export interface ReservationDocumentDto {
  documentId: string;
  kind: ReservationDocumentRecord["kind"];
  title: string;
  description?: string;
  contentType: string;
  sizeBytes: number;
  sortOrder: number;
  /** URL del endpoint proxy para descargar el archivo. */
  fileUrl: string;
}

export function serializeReservationDocument(
  d: ReservationDocumentRecord,
): ReservationDocumentDto {
  return {
    documentId: d.documentId,
    kind: d.kind,
    title: d.title,
    description: d.description,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    sortOrder: d.sortOrder,
    fileUrl: `/api/reservations/documents/${d.documentId}/file`,
  };
}

/**
 * Devuelve la info pública necesaria para pintar el selector de slots en
 * el cliente. NO incluye `byWeekday`/`exceptions` crudos: el cliente pide
 * la disponibilidad por día concreto a `/api/reservations/slots?date=…`.
 */
/** Menú activo expuesto al asistente de reserva. */
export interface PublicReservationMenuOfferDto {
  offerId: string;
  name: string;
  priceCents: number;
  mainCourses: string[];
  sortOrder: number;
  imageUrl: string | null;
}

export interface ReservationConfigDto {
  timezone: string;
  advanceMinMinutes: number;
  advanceMaxDays: number;
  /** Rango fijo opcional: primera fecha reservable (inclusive), `yyyy-MM-dd`. */
  bookableFromDate: string | null;
  /** Rango fijo opcional: última fecha reservable (inclusive), `yyyy-MM-dd`. */
  bookableUntilDate: string | null;
  minPartySize: number;
  maxPartySize: number;
  prepayment: {
    enabled: boolean;
    minPartySize: number;
    amountPerPersonCents: number;
    deadlineHours: number;
  };
  /** Ofertas de menú activas (para reparto por comensal). Puede faltar en respuestas antiguas. */
  menuOffers?: PublicReservationMenuOfferDto[];
}

export function serializePublicMenuOffers(
  offers: ReservationMenuOffer[] | undefined,
): PublicReservationMenuOfferDto[] {
  return (offers ?? [])
    .filter((o) => o.active)
    .map((o) => ({
      offerId: o.offerId,
      name: o.name,
      priceCents: o.priceCents,
      mainCourses: mainCoursesForClientDisplay(o.mainCourses),
      sortOrder: o.sortOrder,
      imageUrl: o.imageS3Key
        ? `/api/reservations/menu-offers/${encodeURIComponent(o.offerId)}/image`
        : null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function serializeReservationConfig(
  slots: ReservationConfigSlotsRecord,
  prepayment: ReservationConfigPrepaymentRecord,
  menus: { offers: ReservationMenuOffer[] },
): ReservationConfigDto {
  return {
    timezone: slots.timezone,
    advanceMinMinutes: slots.advanceMinMinutes,
    advanceMaxDays: slots.advanceMaxDays,
    bookableFromDate: slots.bookableFromDate?.trim() || null,
    bookableUntilDate: slots.bookableUntilDate?.trim() || null,
    minPartySize: slots.minPartySize,
    maxPartySize: slots.maxPartySize,
    prepayment: {
      enabled: prepayment.enabled,
      minPartySize: prepayment.minPartySize,
      amountPerPersonCents: prepayment.amountPerPersonCents,
      deadlineHours: prepayment.deadlineHours,
    },
    menuOffers: serializePublicMenuOffers(menus?.offers),
  };
}

export interface SlotDayDto {
  date: string;
  closedDay: boolean;
  outOfWindow: boolean;
  slots: string[];
}

export function serializeSlotDay(
  date: string,
  result: {
    slots: string[];
    closedDay: boolean;
    outOfWindow: boolean;
  },
): SlotDayDto {
  return {
    date,
    closedDay: result.closedDay,
    outOfWindow: result.outOfWindow,
    slots: result.slots,
  };
}

/** Evita exponer `sessionVersion` al front. */
export interface GuestPublicDto {
  guestId: string;
  name: string;
  email: string;
  phone: string;
}

export function serializeGuestPublic(g: GuestRecord): GuestPublicDto {
  return {
    guestId: g.guestId,
    name: g.name,
    email: g.email,
    phone: g.phone,
  };
}

/** Aplica los placeholders del template de prepago con datos reales. */
export function renderPrepaymentInstructions(
  template: string,
  ctx: {
    amountCents: number;
    deadlineIso: string;
    reservationDate: string;
    reservationTime: string;
    partySize: number;
    reservationId: string;
    /** Nombre del contacto (snapshot al crear la reserva). */
    customerName: string;
  },
): string {
  const amountEuros = (ctx.amountCents / 100).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const deadline = new Date(ctx.deadlineIso);
  const deadlineLabel = `${String(deadline.getDate()).padStart(2, "0")}/${String(
    deadline.getMonth() + 1,
  ).padStart(2, "0")}/${deadline.getFullYear()} ${String(
    deadline.getHours(),
  ).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`;
  const nameLabel = ctx.customerName.trim() || "—";
  const prepaymentConcept = buildPrepaymentConcept(
    ctx.reservationId,
    ctx.customerName,
  );
  return template
    .replaceAll("{{amount}}", `${amountEuros} €`)
    .replaceAll("{{deadline}}", deadlineLabel)
    .replaceAll("{{reservationDate}}", ctx.reservationDate)
    .replaceAll("{{reservationTime}}", ctx.reservationTime)
    .replaceAll("{{partySize}}", String(ctx.partySize))
    .replaceAll("{{reservationId}}", ctx.reservationId)
    .replaceAll("{{prepaymentConcept}}", prepaymentConcept)
    .replaceAll("{{customerName}}", nameLabel);
}

export type { ReservationSlotDay };

// ─── Serializadores específicos para el backoffice (staff) ─────────────

import type { ReservationNoteRecord } from "@/types/models";

/**
 * Detalle ampliado del admin: incluye datos internos que no enviamos al
 * cliente (guestId, userId, unreadForStaff, lastClientVisibleStatus,
 * etc.). El DTO cliente (`ReservationDto`) sigue siendo el "base".
 */
export interface AdminReservationDto extends ReservationDto {
  userId: string | null;
  guestId: string | null;
  membershipId?: string;
  unreadForStaff: number;
  createdVia: ReservationRecord["createdVia"];
  updatedBy?: string;
  prepaymentReceivedAt?: string;
  prepaymentReceivedByUserId?: string;
  /**
   * Comprobantes con importe (cada `amountCents` en céntimos; `legacy` sin
   * importe guardado mantiene 0 en el resumen de total).
   */
  prepaymentProofItems: AdminPrepaymentProofItemDto[];
  /** Suma de `prepaymentProofItems` con importe; 0 si solo hay `legacy` sin cifras. */
  prepaymentTotalReceivedCents: number;
  /** Nombre de un justificante (legacy o primer ítem) para compatibilidad. */
  prepaymentProofFileName?: string;
  /** Etiqueta de mesa (solo staff). */
  tableLabel?: string;
}

export function serializeAdminReservation(
  r: ReservationRecord,
): AdminReservationDto {
  const prepaymentProofItems = adminPrepaymentProofDtosFromRecord(r);
  const prepaymentTotalReceivedCents = prepaymentProofItems.reduce(
    (s, p) => s + p.amountCents,
    0,
  );
  return {
    ...serializeReservation(r),
    userId: r.userId ?? null,
    guestId: r.guestId ?? null,
    membershipId: r.membershipId,
    unreadForStaff: r.unreadForStaff ?? 0,
    createdVia: r.createdVia,
    updatedBy: r.updatedBy,
    prepaymentReceivedAt: r.prepaymentReceivedAt,
    prepaymentReceivedByUserId: r.prepaymentReceivedByUserId,
    prepaymentProofItems,
    prepaymentTotalReceivedCents,
    prepaymentProofFileName:
      r.prepaymentProofFileName ?? prepaymentProofItems[0]?.fileName,
    tableLabel: r.tableLabel,
  };
}

export interface ReservationNoteDto {
  noteId: string;
  body: string;
  createdAt: string;
  createdByUserId: string;
  createdByDisplayName: string;
}

export function serializeReservationNote(
  n: ReservationNoteRecord,
): ReservationNoteDto {
  return {
    noteId: n.noteId,
    body: n.body,
    createdAt: n.createdAt,
    createdByUserId: n.createdByUserId,
    createdByDisplayName: n.createdByDisplayName,
  };
}

/**
 * Evento interno (staff): incluye los no públicos. Se reutiliza el
 * mismo DTO (`ReservationEventDto`); los consumidores deciden filtrar.
 */
export function serializeAdminReservationEvent(
  e: ReservationEventRecord,
): ReservationEventDto {
  return serializeReservationEvent(e);
}

/** Config completa para el formulario de admin. */
export interface AdminSlotsConfigDto {
  timezone: string;
  byWeekday: ReservationConfigSlotsRecord["byWeekday"];
  exceptions: ReservationConfigSlotsRecord["exceptions"];
  advanceMinMinutes: number;
  advanceMaxDays: number;
  bookableFromDate: string;
  bookableUntilDate: string;
  minPartySize: number;
  maxPartySize: number;
  updatedAt: string;
}

export function serializeAdminSlotsConfig(
  r: ReservationConfigSlotsRecord,
): AdminSlotsConfigDto {
  return {
    timezone: r.timezone,
    byWeekday: r.byWeekday,
    exceptions: r.exceptions,
    advanceMinMinutes: r.advanceMinMinutes,
    advanceMaxDays: r.advanceMaxDays,
    bookableFromDate: r.bookableFromDate?.trim() ?? "",
    bookableUntilDate: r.bookableUntilDate?.trim() ?? "",
    minPartySize: r.minPartySize,
    maxPartySize: r.maxPartySize,
    updatedAt: r.updatedAt,
  };
}

export interface AdminPrepaymentConfigDto {
  enabled: boolean;
  minPartySize: number;
  amountPerPersonCents: number;
  deadlineHours: number;
  instructionsTemplate: string;
  updatedAt: string;
}

export function serializeAdminPrepaymentConfig(
  r: ReservationConfigPrepaymentRecord,
): AdminPrepaymentConfigDto {
  return {
    enabled: r.enabled,
    minPartySize: r.minPartySize,
    amountPerPersonCents: r.amountPerPersonCents,
    deadlineHours: r.deadlineHours,
    instructionsTemplate: r.instructionsTemplate,
    updatedAt: r.updatedAt,
  };
}

export interface AdminAccessGatesConfigDto {
  /** ISO 8601; ausente = sin cierre fijado en Dynamo. */
  carnetPurchaseDeadlineIso?: string;
  tableReservationDeadlineIso?: string;
  loginDeadlineIso?: string;
  updatedAt: string;
}

export function serializeAdminAccessGatesConfig(
  r: ReservationConfigAccessGatesRecord,
): AdminAccessGatesConfigDto {
  return {
    carnetPurchaseDeadlineIso: r.carnetPurchaseDeadlineIso?.trim() || undefined,
    tableReservationDeadlineIso:
      r.tableReservationDeadlineIso?.trim() || undefined,
    loginDeadlineIso: r.loginDeadlineIso?.trim() || undefined,
    updatedAt: r.updatedAt,
  };
}

/** @deprecated Alias retrocompatible. */
export type AdminCarnetPurchaseConfigDto = AdminAccessGatesConfigDto;
/** @deprecated Alias retrocompatible. */
export const serializeAdminCarnetPurchaseConfig =
  serializeAdminAccessGatesConfig;

export interface AdminMenusConfigDto {
  offers: ReservationMenuOffer[];
  updatedAt: string;
}

export function serializeAdminMenusConfig(
  r: ReservationConfigMenusRecord,
): AdminMenusConfigDto {
  return {
    offers: (r.offers ?? []).map((o) => ({ ...o })),
    updatedAt: r.updatedAt,
  };
}
