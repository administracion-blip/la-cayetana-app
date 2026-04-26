/**
 * Repositorio del módulo de Reservas. Toda la lógica de persistencia y
 * las reglas de negocio que **no** sean puro cálculo de slots viven aquí
 * (el cálculo puro está en `lib/repositories/reservation-config.ts`).
 *
 * Modelo de tabla `la_cayetana_reservations` (single-table):
 *
 *  - RESERVATION  · `PK = RES#<id>`        · `SK = META`
 *  - MESSAGE      · `PK = RES#<id>`        · `SK = MSG#<iso>#<msgId>`
 *  - EVENT        · `PK = RES#<id>`        · `SK = EVT#<iso>#<evtId>`
 *  - NOTE         · `PK = RES#<id>`        · `SK = NOTE#<iso>#<noteId>`
 *  - GUEST        · `PK = GUEST#<id>`      · `SK = META`
 *  - DOCUMENT     · `PK = DOC#<id>`        · `SK = META`
 *  - CONFIG_SLOTS · `PK = CONFIG`          · `SK = SLOTS`
 *  - CONFIG_PRE   · `PK = CONFIG`          · `SK = PREPAYMENT`
 *  - CONFIG_MENUS · `PK = CONFIG`          · `SK = MENUS`
 *
 * Los GSIs se explican en `types/models.ts`.
 */

import { randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { formatLocalDate } from "@/lib/datetime";
import { getDocClient } from "@/lib/dynamo";
import { requireReservationsEnv } from "@/lib/env";
import { deleteObject } from "@/lib/s3";
import { normalizeEmail, normalizePhone } from "@/lib/identity";
import {
  getMenusConfig,
  getPrepaymentConfig,
  getSlotsConfig,
  reservationDateKeyFor,
  validateReservationInstant,
} from "@/lib/repositories/reservation-config";
import {
  buildMenuLineItemsForCreate,
  buildMenuLineItemsForStaffUpdate,
  type MenuLineInput,
  ReservationMenuSelectionError,
} from "@/lib/repositories/reservation-menu-selections";
import type {
  GuestRecord,
  PrepaymentProofItem,
  PrepaymentStatus,
  ReservationContactSnapshot,
  ReservationEventRecord,
  ReservationMessageRecord,
  ReservationNoteRecord,
  ReservationRecord,
  ReservationStatus,
} from "@/types/models";

type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;

const RES_ENTITY: ReservationRecord["entityType"] = "RESERVATION";
const MSG_ENTITY: ReservationMessageRecord["entityType"] = "RESERVATION_MESSAGE";
const EVT_ENTITY: ReservationEventRecord["entityType"] = "RESERVATION_EVENT";
const NOTE_ENTITY: ReservationNoteRecord["entityType"] = "RESERVATION_NOTE";
const GUEST_ENTITY: GuestRecord["entityType"] = "RESERVATION_GUEST";

const GSI_BY_STATUS_DATE = "by-status-date";
const GSI_BY_DATE = "by-date";
const GSI_BY_CUSTOMER = "by-customer";
const GSI_BY_EMAIL = "by-email";

/** Estados considerados "activos" (ni finalizados ni cancelados). */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = [
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
];

export function isActiveReservationStatus(s: ReservationStatus): boolean {
  return ACTIVE_RESERVATION_STATUSES.includes(s);
}

/**
 * Si al cambiar el estado hay que invalidar el magic link del guest.
 *
 * Política actual: solo invalidamos cuando la reserva deja de estar
 * activa (cancelación por staff o `no_show`). Los pasos intermedios
 * como `awaiting_customer`, `awaiting_prepayment` o `confirmed` NO
 * invalidan: el guest sigue necesitando el chat en caliente y forzarle
 * a abrir un nuevo email rompe la UX conversacional.
 */
const GUEST_INVALIDATING_STATUSES: ReservationStatus[] = [
  "cancelled_by_staff",
  "no_show",
];

// ─── Errores ──────────────────────────────────────────────────────────────

export class ReservationNotFoundError extends Error {
  constructor() {
    super("Reserva no encontrada");
    this.name = "ReservationNotFoundError";
  }
}

export class ReservationConflictError extends Error {
  constructor(message = "La reserva fue modificada por otro usuario") {
    super(message);
    this.name = "ReservationConflictError";
  }
}

export class ReservationDuplicateError extends Error {
  readonly reservationId: string;
  constructor(reservationId: string) {
    super("Ya existe una reserva activa para ese email en esa fecha");
    this.name = "ReservationDuplicateError";
    this.reservationId = reservationId;
  }
}

// ─── Contact snapshot & GSI helpers ───────────────────────────────────────

export function buildContactSnapshot(input: {
  name: string;
  email: string;
  phone: string;
}): ReservationContactSnapshot {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    phone: normalizePhone(input.phone),
  };
}

function statusGsi(status: ReservationStatus): ReservationRecord["GSI1PK"] {
  return `STATUS#${status}`;
}

function dateGsi(dateKey: string): ReservationRecord["GSI2PK"] {
  return `DATE#${dateKey}`;
}

function customerGsi(identity: {
  userId: string | null;
  guestId: string | null;
}): ReservationRecord["GSI3PK"] {
  if (identity.userId) return `USER#${identity.userId}`;
  if (identity.guestId) return `GUEST#${identity.guestId}`;
  throw new Error("Reserva sin userId ni guestId");
}

function emailGsi(
  normalizedEmail: string,
): ReservationRecord["GSI4PK"] {
  return `EMAIL#${normalizedEmail}`;
}

// ─── Guest (upsert por email) ─────────────────────────────────────────────

/**
 * Devuelve el `GuestRecord` del email si existe (lookup por GSI `by-email`).
 * Si el email está asociado también a un socio logueado, este método
 * devuelve igualmente el guest: lo que haga el caller con esa info
 * (unificar, priorizar user, etc.) es responsabilidad del orquestador.
 */
export async function findGuestByEmail(
  email: string,
): Promise<GuestRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      IndexName: GSI_BY_EMAIL,
      KeyConditionExpression: "GSI4PK = :pk AND begins_with(GSI4SK, :sk)",
      FilterExpression: "entityType = :et",
      ExpressionAttributeValues: {
        ":pk": `EMAIL#${normalizedEmail}`,
        ":sk": "GUEST#",
        ":et": GUEST_ENTITY,
      },
      Limit: 1,
    }),
  );
  const item = (res.Items ?? [])[0] as GuestRecord | undefined;
  return item ?? null;
}

export async function getGuestById(
  guestId: string,
): Promise<GuestRecord | null> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `GUEST#${guestId}`, SK: "META" },
    }),
  );
  const item = res.Item as GuestRecord | undefined;
  if (!item || item.entityType !== GUEST_ENTITY) return null;
  return item;
}

/**
 * Crea el guest si no existe o actualiza su nombre/teléfono si cambian.
 * NO toca `sessionVersion` (eso es responsabilidad exclusiva de
 * `bumpGuestSessionVersion`).
 */
export async function upsertGuest(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<GuestRecord> {
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await findGuestByEmail(normalizedEmail);
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();

  if (existing) {
    const trimmedName = input.name.trim();
    const normalizedPhone = normalizePhone(input.phone);
    const needsUpdate =
      existing.name !== trimmedName || existing.phone !== normalizedPhone;
    if (!needsUpdate) return existing;
    const res = await doc.send(
      new UpdateCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression: "SET #n = :n, phone = :p, updatedAt = :u",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":n": trimmedName,
          ":p": normalizedPhone,
          ":u": now,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes as GuestRecord;
  }

  const guestId = randomUUID();
  const record: GuestRecord = {
    PK: `GUEST#${guestId}`,
    SK: "META",
    GSI4PK: `EMAIL#${normalizedEmail}`,
    GSI4SK: `GUEST#${guestId}`,
    entityType: GUEST_ENTITY,
    guestId,
    name: input.name.trim(),
    email: input.email.trim(),
    emailNormalized: normalizedEmail,
    phone: normalizePhone(input.phone),
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );
  return record;
}

/**
 * Bumpea `sessionVersion` del guest → cualquier magic-link antiguo queda
 * invalidado. Se llama cuando staff hace un cambio relevante en una de
 * sus reservas.
 */
export async function bumpGuestSessionVersion(guestId: string): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  try {
    await doc.send(
      new UpdateCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: `GUEST#${guestId}`, SK: "META" },
        UpdateExpression:
          "SET sessionVersion = if_not_exists(sessionVersion, :zero) + :one, updatedAt = :u",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":u": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    if (isConditionalFailed(err)) {
      // Si el guest no existe no es un caso crítico: el magic link lo
      // firma este mismo backend, no tenemos nada que invalidar.
      return;
    }
    throw err;
  }
}

// ─── Reservation CRUD ─────────────────────────────────────────────────────

export interface CreateReservationInput {
  /** Identidad del cliente. Uno y solo uno de los dos debe venir. */
  userId: string | null;
  guestId: string | null;
  membershipId?: string;
  contact: { name: string; email: string; phone: string };
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  notes?: string;
  /** Líneas con cantidades; la suma debe ser `partySize`. */
  menuLines: MenuLineInput[];
  createdVia: ReservationRecord["createdVia"];
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationRecord> {
  if ((input.userId && input.guestId) || (!input.userId && !input.guestId)) {
    throw new Error("Reserva: debe venir userId O guestId (exclusivos)");
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const slotsConfig = await getSlotsConfig();
  if (
    input.partySize < slotsConfig.minPartySize ||
    input.partySize > slotsConfig.maxPartySize
  ) {
    throw new Error(
      `Tamaño de grupo fuera de rango (${slotsConfig.minPartySize}-${slotsConfig.maxPartySize})`,
    );
  }

  const { reservationStartAtIso, startMinutes } = validateReservationInstant({
    reservationDate: input.reservationDate,
    reservationTime: input.reservationTime,
    now,
    config: slotsConfig,
  });

  const menusConfig = await getMenusConfig();
  const menuLineItems = buildMenuLineItemsForCreate(
    input.menuLines,
    menusConfig.offers,
    input.partySize,
  );

  // Detección de duplicados: misma persona (por email normalizado) con
  // una reserva ACTIVA en el mismo día. Evita clicks múltiples.
  const normalizedEmail = normalizeEmail(input.contact.email);
  const existing = await findActiveReservationByEmailAndDate(
    normalizedEmail,
    input.reservationDate,
  );
  if (existing) throw new ReservationDuplicateError(existing.reservationId);

  // Prepago: solo se marca `awaiting_prepayment` si procede por tamaño.
  const prepaymentConfig = await getPrepaymentConfig();
  const needsPrepayment =
    prepaymentConfig.enabled && input.partySize >= prepaymentConfig.minPartySize;
  const prepaymentStatus: PrepaymentStatus = needsPrepayment
    ? "pending_instructions"
    : "not_required";
  const prepaymentAmountCents = needsPrepayment
    ? prepaymentConfig.amountPerPersonCents * input.partySize
    : undefined;
  const prepaymentDeadlineAt = needsPrepayment
    ? new Date(
        now.getTime() + prepaymentConfig.deadlineHours * 60 * 60 * 1000,
      ).toISOString()
    : undefined;

  const status: ReservationStatus = needsPrepayment
    ? "awaiting_prepayment"
    : "pending";

  const reservationId = randomUUID();
  const dateKey = reservationDateKeyFor(
    reservationStartAtIso,
    slotsConfig.timezone,
  );

  const record: ReservationRecord = {
    PK: `RES#${reservationId}`,
    SK: "META",
    GSI1PK: statusGsi(status),
    GSI1SK: `${reservationStartAtIso}#${reservationId}`,
    GSI2PK: dateGsi(dateKey),
    GSI2SK: `${String(startMinutes).padStart(4, "0")}#${reservationId}`,
    GSI3PK: customerGsi(input),
    GSI3SK: `${reservationStartAtIso}#${reservationId}`,
    GSI4PK: emailGsi(normalizedEmail),
    GSI4SK: `RES#${nowIso}#${reservationId}`,
    entityType: RES_ENTITY,
    reservationId,
    userId: input.userId,
    guestId: input.guestId,
    membershipId: input.membershipId,
    contact: buildContactSnapshot(input.contact),
    reservationDate: input.reservationDate,
    reservationTime: input.reservationTime,
    reservationStartAtIso,
    startMinutes,
    partySize: input.partySize,
    notes: input.notes?.trim() || undefined,
    menuLineItems:
      menuLineItems.length > 0 ? menuLineItems : undefined,
    status,
    prepaymentStatus,
    prepaymentAmountCents,
    prepaymentDeadlineAt,
    lastClientVisibleStatus: status,
    createdAt: nowIso,
    createdVia: input.createdVia,
    updatedAt: nowIso,
    updatedBy: input.userId ?? `guest:${input.guestId ?? "unknown"}`,
    version: 1,
    unreadForStaff: 1,
    unreadForCustomer: 0,
    lastMessageAt: undefined,
  };

  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();

  // Evento inicial "reservation_created" para el timeline.
  const eventRecord: ReservationEventRecord = {
    PK: record.PK,
    SK: `EVT#${nowIso}#${randomUUID()}`,
    entityType: EVT_ENTITY,
    eventId: randomUUID(),
    reservationId,
    kind: "reservation_created",
    meta: { status, needsPrepayment },
    publicToCustomer: true,
    createdAt: nowIso,
    createdBy: record.updatedBy ?? "system",
  };

  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: RESERVATIONS_TABLE_NAME,
            Item: record,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: RESERVATIONS_TABLE_NAME,
            Item: eventRecord,
          },
        },
      ],
    }),
  );

  return record;
}

export async function getReservationById(
  reservationId: string,
): Promise<ReservationRecord | null> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `RES#${reservationId}`, SK: "META" },
    }),
  );
  const item = res.Item as ReservationRecord | undefined;
  if (!item || item.entityType !== RES_ENTITY) return null;
  return item;
}

// ─── Transiciones de estado ───────────────────────────────────────────────

export interface UpdateReservationStatusInput {
  reservationId: string;
  expectedVersion: number;
  newStatus: ReservationStatus;
  updatedBy: string;
  /** Si `true`, también se pasa prepayment a `received`. */
  markPrepaymentReceived?: boolean;
  /**
   * Metadatos del justificante (Señal). Requiere S3; no usar sin subida previa.
   * @deprecated Preferir `prepaymentProofItems`.
   */
  prepaymentProofS3Key?: string;
  prepaymentProofFileName?: string;
  /**
   * Uno o varios justificantes (reemplaza la pareja legacy al persistirse).
   */
  prepaymentProofItems?: PrepaymentProofItem[];
  /** Mensaje público que se añade al cambiar el estado (opcional). */
  systemMessage?: string;
  /** Metadata extra para el evento (motivo, observaciones, etc.). */
  eventMeta?: Record<string, unknown>;
  /** Si `true`, la operación bumpea `sessionVersion` del guest (si aplica). */
  invalidateGuestSession?: boolean;
}

/**
 * Actualiza el estado + datos derivados con `TransactWrite`:
 *  - Reserva: nuevo `status`, GSI1SK, `version = expected + 1`.
 *  - Evento append-only.
 *  - Opcional: mensaje del sistema, prepayment recibido, guest bump.
 *
 * Falla con `ReservationConflictError` si `version != expectedVersion`.
 */
export async function updateReservationStatus(
  input: UpdateReservationStatusInput,
): Promise<ReservationRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  if (reservation.status === input.newStatus && !input.markPrepaymentReceived) {
    return reservation;
  }
  const nowIso = new Date().toISOString();
  const transact: TransactItems = [];

  const nextPrepaymentStatus: PrepaymentStatus | undefined =
    input.markPrepaymentReceived ? "received" : undefined;

  // Update de la reserva con condición optimista.
  const updateExprParts: string[] = [
    "#s = :s",
    "GSI1PK = :gsi1pk",
    "GSI1SK = :gsi1sk",
    "version = :nextVersion",
    "updatedAt = :u",
    "updatedBy = :ub",
    "lastClientVisibleStatus = :s",
  ];
  const values: Record<string, unknown> = {
    ":s": input.newStatus,
    ":gsi1pk": statusGsi(input.newStatus),
    ":gsi1sk": `${reservation.reservationStartAtIso}#${reservation.reservationId}`,
    ":nextVersion": input.expectedVersion + 1,
    ":u": nowIso,
    ":ub": input.updatedBy,
    ":expectedVersion": input.expectedVersion,
  };
  const names: Record<string, string> = { "#s": "status" };
  if (nextPrepaymentStatus) {
    updateExprParts.push(
      "prepaymentStatus = :ps",
      "prepaymentReceivedAt = :pra",
      "prepaymentReceivedByUserId = :prb",
    );
    values[":ps"] = nextPrepaymentStatus;
    values[":pra"] = nowIso;
    values[":prb"] = input.updatedBy;
    if (input.prepaymentProofItems && input.prepaymentProofItems.length > 0) {
      updateExprParts.push("prepaymentProofItems = :ppi");
      values[":ppi"] = input.prepaymentProofItems;
    } else if (input.prepaymentProofS3Key) {
      updateExprParts.push(
        "prepaymentProofS3Key = :pks",
        "prepaymentProofFileName = :pkn",
      );
      values[":pks"] = input.prepaymentProofS3Key;
      values[":pkn"] = (input.prepaymentProofFileName ?? "justificante").slice(
        0,
        200,
      );
    }
  }
  if (input.systemMessage) {
    // Un solo Update al META: DynamoDB prohíbe dos operaciones sobre el mismo
    // ítem en un TransactWriteItems (p. e. cancel + chat de sistema).
    updateExprParts.push(
      "unreadForCustomer = if_not_exists(unreadForCustomer, :msgZero) + :msgOne",
      "lastMessageAt = :u",
    );
    values[":msgZero"] = 0;
    values[":msgOne"] = 1;
  }

  const setProofItems =
    nextPrepaymentStatus &&
    input.prepaymentProofItems &&
    input.prepaymentProofItems.length > 0;
  const setLegacyProof =
    nextPrepaymentStatus && input.prepaymentProofS3Key;
  const removePart = setProofItems
    ? " REMOVE prepaymentProofS3Key, prepaymentProofFileName"
    : setLegacyProof
      ? " REMOVE prepaymentProofItems"
      : "";

  transact.push({
    Update: {
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: reservation.PK, SK: reservation.SK },
      UpdateExpression: `SET ${updateExprParts.join(", ")}${removePart}`,
      ConditionExpression: "version = :expectedVersion",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  });

  // Evento de auditoría (siempre público para que el cliente lo vea).
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "status_changed",
    meta: {
      from: reservation.status,
      to: input.newStatus,
      ...input.eventMeta,
    },
    publicToCustomer: true,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };
  transact.push({
    Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event },
  });

  // Mensaje de sistema opcional (aparece en el chat del cliente).
  if (input.systemMessage) {
    const messageId = randomUUID();
    const msg: ReservationMessageRecord = {
      PK: reservation.PK,
      SK: `MSG#${nowIso}#${messageId}`,
      entityType: MSG_ENTITY,
      messageId,
      reservationId: reservation.reservationId,
      authorType: "system",
      authorId: null,
      authorDisplayName: "Equipo La Cayetana",
      body: input.systemMessage,
      createdAt: nowIso,
      readByCustomerAt: null,
      readByStaffAt: nowIso,
    };
    transact.push({
      Put: { TableName: RESERVATIONS_TABLE_NAME, Item: msg },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }

  if (
    input.invalidateGuestSession &&
    reservation.guestId &&
    GUEST_INVALIDATING_STATUSES.includes(input.newStatus)
  ) {
    await bumpGuestSessionVersion(reservation.guestId);
  }

  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

/**
 * Actualiza fecha/hora de la reserva manteniendo el resto del estado.
 * Siempre bumpea `sessionVersion` del guest si aplica: el magic-link
 * anterior deja de servir (regla pactada).
 */
export interface UpdateReservationScheduleInput {
  reservationId: string;
  expectedVersion: number;
  reservationDate: string;
  reservationTime: string;
  updatedBy: string;
  systemMessage?: string;
}

export async function updateReservationSchedule(
  input: UpdateReservationScheduleInput,
): Promise<ReservationRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  const slotsConfig = await getSlotsConfig();
  const now = new Date();
  const { reservationStartAtIso, startMinutes } = validateReservationInstant({
    reservationDate: input.reservationDate,
    reservationTime: input.reservationTime,
    now,
    config: slotsConfig,
    skipBookableDateRange: true,
  });
  const nowIso = now.toISOString();
  const dateKey = reservationDateKeyFor(
    reservationStartAtIso,
    slotsConfig.timezone,
  );

  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "schedule_changed",
    meta: {
      from: {
        date: reservation.reservationDate,
        time: reservation.reservationTime,
      },
      to: { date: input.reservationDate, time: input.reservationTime },
    },
    publicToCustomer: true,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };

  const transact: TransactItems = [
    {
      Update: {
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression: [
          "SET reservationDate = :d",
          "reservationTime = :t",
          "reservationStartAtIso = :iso",
          "startMinutes = :sm",
          "GSI1SK = :gsi1sk",
          "GSI2PK = :gsi2pk",
          "GSI2SK = :gsi2sk",
          "GSI3SK = :gsi3sk",
          "version = :nextVersion",
          "updatedAt = :u",
          "updatedBy = :ub",
        ].join(", "),
        ConditionExpression: "version = :expectedVersion",
        ExpressionAttributeValues: {
          ":d": input.reservationDate,
          ":t": input.reservationTime,
          ":iso": reservationStartAtIso,
          ":sm": startMinutes,
          ":gsi1sk": `${reservationStartAtIso}#${reservation.reservationId}`,
          ":gsi2pk": dateGsi(dateKey),
          ":gsi2sk": `${String(startMinutes).padStart(4, "0")}#${reservation.reservationId}`,
          ":gsi3sk": `${reservationStartAtIso}#${reservation.reservationId}`,
          ":nextVersion": input.expectedVersion + 1,
          ":u": nowIso,
          ":ub": input.updatedBy,
          ":expectedVersion": input.expectedVersion,
        },
      },
    },
    { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
  ];

  if (input.systemMessage) {
    const messageId = randomUUID();
    transact.push({
      Put: {
        TableName: RESERVATIONS_TABLE_NAME,
        Item: {
          PK: reservation.PK,
          SK: `MSG#${nowIso}#${messageId}`,
          entityType: MSG_ENTITY,
          messageId,
          reservationId: reservation.reservationId,
          authorType: "system",
          authorId: null,
          authorDisplayName: "Equipo La Cayetana",
          body: input.systemMessage,
          createdAt: nowIso,
          readByCustomerAt: null,
          readByStaffAt: nowIso,
        } satisfies ReservationMessageRecord,
      },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }

  if (reservation.guestId) {
    await bumpGuestSessionVersion(reservation.guestId);
  }

  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

/** Staff: edita en bloque contacto, comensales y fecha/hora (índices + señal). */
export interface UpdateReservationDetailsInput {
  reservationId: string;
  expectedVersion: number;
  contact: { name: string; email: string; phone: string };
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  updatedBy: string;
  systemMessage?: string;
  /**
   * Reparto de menús nuevo. Si llega, se escribe en la misma transacción
   * que el resto: rompe el bloqueo cruzado entre `partySize` y `menuLineItems`
   * (cada validación exigía que el otro ya estuviera alineado).
   *
   * Reglas:
   *  - Si llega y la reserva ya tenía menús → se sustituye el reparto.
   *  - Si llega vacío `[]` → se borra el reparto (queda sin menú detallado).
   *  - Si NO llega → se mantiene el comportamiento previo (la suma del
   *    reparto existente debe coincidir con el nuevo `partySize`).
   */
  menuLines?: MenuLineInput[];
}

export async function updateReservationDetails(
  input: UpdateReservationDetailsInput,
): Promise<ReservationRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }

  const slotsConfig = await getSlotsConfig();
  if (
    input.partySize < slotsConfig.minPartySize ||
    input.partySize > slotsConfig.maxPartySize
  ) {
    throw new Error(
      `Comensales fuera de rango (${slotsConfig.minPartySize}-${slotsConfig.maxPartySize})`,
    );
  }

  // Validación / construcción de menús ---------------------------------
  // Tres caminos:
  //  - `menuLines` indefinido  → no se tocan menús, pero la suma del
  //    reparto existente debe casar con la nueva `partySize`.
  //  - `menuLines === []`      → se borra el reparto (la reserva pasa a
  //    no tener menú detallado).
  //  - `menuLines.length > 0`  → se reescribe el reparto; debe sumar
  //    `partySize` y respetar la carta vigente.
  let nextMenuLineItems: ReservationRecord["menuLineItems"] | undefined;
  if (input.menuLines !== undefined) {
    if (input.menuLines.length === 0) {
      nextMenuLineItems = [];
    } else {
      const menusConfig = await getMenusConfig();
      nextMenuLineItems = buildMenuLineItemsForStaffUpdate(
        input.menuLines,
        menusConfig.offers,
        input.partySize,
        reservation.menuLineItems,
      );
    }
  } else {
    const existing = reservation.menuLineItems;
    if (existing && existing.length > 0) {
      const sum = existing.reduce((s, l) => s + l.quantity, 0);
      if (sum !== input.partySize) {
        throw new ReservationMenuSelectionError(
          "sum_mismatch",
          `La suma de menús (${sum}) debe coincidir con comensales (${input.partySize}). Ajusta el reparto de menús en la sección correspondiente.`,
        );
      }
    }
  }

  const normalizedEmail = normalizeEmail(input.contact.email);
  const duplicate = await findActiveReservationByEmailAndDate(
    normalizedEmail,
    input.reservationDate,
  );
  if (duplicate && duplicate.reservationId !== reservation.reservationId) {
    throw new ReservationDuplicateError(duplicate.reservationId);
  }

  const now = new Date();
  const { reservationStartAtIso, startMinutes } = validateReservationInstant({
    reservationDate: input.reservationDate,
    reservationTime: input.reservationTime,
    now,
    config: slotsConfig,
    skipBookableDateRange: true,
  });
  const nowIso = now.toISOString();
  const dateKey = reservationDateKeyFor(
    reservationStartAtIso,
    slotsConfig.timezone,
  );
  const contactSnap = buildContactSnapshot(input.contact);

  const prepConfig = await getPrepaymentConfig();
  const stillNeedsPrepay =
    prepConfig.enabled && input.partySize >= prepConfig.minPartySize;
  const newPrepayTotal = stillNeedsPrepay
    ? prepConfig.amountPerPersonCents * input.partySize
    : 0;
  const hadPrepayRecord =
    reservation.prepaymentAmountCents != null ||
    (reservation.prepaymentStatus != null &&
      reservation.prepaymentStatus !== "not_required");

  const setParts: string[] = [
    "#ct = :ct",
    "partySize = :ps",
    "reservationDate = :d",
    "reservationTime = :t",
    "reservationStartAtIso = :iso",
    "startMinutes = :sm",
    "GSI1SK = :gsi1sk",
    "GSI2PK = :gsi2pk",
    "GSI2SK = :gsi2sk",
    "GSI3SK = :gsi3sk",
    "GSI4PK = :gsi4pk",
    "GSI4SK = :gsi4sk",
    "version = :nextVersion",
    "updatedAt = :u",
    "updatedBy = :ub",
  ];
  const values: Record<string, unknown> = {
    ":ct": contactSnap,
    ":ps": input.partySize,
    ":d": input.reservationDate,
    ":t": input.reservationTime,
    ":iso": reservationStartAtIso,
    ":sm": startMinutes,
    ":gsi1sk": `${reservationStartAtIso}#${reservation.reservationId}`,
    ":gsi2pk": dateGsi(dateKey),
    ":gsi2sk": `${String(startMinutes).padStart(4, "0")}#${reservation.reservationId}`,
    ":gsi3sk": `${reservationStartAtIso}#${reservation.reservationId}`,
    ":gsi4pk": emailGsi(normalizedEmail),
    ":gsi4sk": `RES#${reservation.createdAt}#${reservation.reservationId}`,
    ":nextVersion": input.expectedVersion + 1,
    ":u": nowIso,
    ":ub": input.updatedBy,
    ":expectedVersion": input.expectedVersion,
  };
  const names: Record<string, string> = { "#ct": "contact" };

  if (stillNeedsPrepay && hadPrepayRecord) {
    setParts.push("prepaymentAmountCents = :pamt");
    values[":pamt"] = newPrepayTotal;
  } else if (!stillNeedsPrepay && hadPrepayRecord) {
    setParts.push("prepaymentStatus = :pnot");
    values[":pnot"] = "not_required";
  }

  const removeParts: string[] = [];
  if (!stillNeedsPrepay && hadPrepayRecord) {
    removeParts.push(
      "prepaymentAmountCents",
      "prepaymentDeadlineAt",
      "prepaymentProofS3Key",
      "prepaymentProofFileName",
      "prepaymentProofItems",
    );
  }

  // Si llega `menuLines`, lo escribimos en el mismo Update. `[]` borra
  // el atributo (DynamoDB no admite SET de array vacío como lista, así
  // que en ese caso usamos REMOVE).
  if (nextMenuLineItems !== undefined) {
    if (nextMenuLineItems.length === 0) {
      removeParts.push("menuLineItems");
    } else {
      setParts.push("menuLineItems = :mli");
      values[":mli"] = nextMenuLineItems;
    }
  }

  if (input.systemMessage) {
    setParts.push(
      "unreadForCustomer = if_not_exists(unreadForCustomer, :r0) + :r1",
      "lastMessageAt = :u",
    );
    values[":r0"] = 0;
    values[":r1"] = 1;
  }

  const removeClause =
    removeParts.length > 0 ? ` REMOVE ${removeParts.join(", ")}` : "";

  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "details_changed",
    meta: {
      from: {
        contact: reservation.contact,
        partySize: reservation.partySize,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
      },
      to: {
        contact: contactSnap,
        partySize: input.partySize,
        reservationDate: input.reservationDate,
        reservationTime: input.reservationTime,
      },
    },
    publicToCustomer: true,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };

  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const doc = getDocClient();
  const transact: TransactItems = [
    {
      Update: {
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression: `SET ${setParts.join(", ")}${removeClause}`,
        ConditionExpression: "version = :expectedVersion",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    },
    { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
  ];

  // Evento adicional cuando cambiamos el reparto de menús, para que
  // quede traza en el historial igual que en `updateReservationMenuLineItems`.
  if (nextMenuLineItems !== undefined) {
    const menuEventId = randomUUID();
    const menuEvent: ReservationEventRecord = {
      PK: reservation.PK,
      SK: `EVT#${nowIso}#${menuEventId}`,
      entityType: EVT_ENTITY,
      eventId: menuEventId,
      reservationId: reservation.reservationId,
      kind: "menu_selection_changed",
      meta: { lineCount: nextMenuLineItems.length },
      publicToCustomer: true,
      createdAt: nowIso,
      createdBy: input.updatedBy,
    };
    transact.push({
      Put: { TableName: RESERVATIONS_TABLE_NAME, Item: menuEvent },
    });
  }

  if (input.systemMessage) {
    const messageId = randomUUID();
    const msg: ReservationMessageRecord = {
      PK: reservation.PK,
      SK: `MSG#${nowIso}#${messageId}`,
      entityType: MSG_ENTITY,
      messageId,
      reservationId: reservation.reservationId,
      authorType: "system",
      authorId: null,
      authorDisplayName: "Equipo La Cayetana",
      body: input.systemMessage,
      createdAt: nowIso,
      readByCustomerAt: null,
      readByStaffAt: nowIso,
    };
    transact.push({ Put: { TableName: RESERVATIONS_TABLE_NAME, Item: msg } });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }

  if (reservation.guestId) {
    await bumpGuestSessionVersion(reservation.guestId);
  }

  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

export interface UpdateReservationMenuLineItemsInput {
  reservationId: string;
  expectedVersion: number;
  menuLines: MenuLineInput[];
  updatedBy: string;
  systemMessage?: string;
}

/**
 * Staff: actualiza reparto de menús. Valida que la suma = partySize.
 */
export async function updateReservationMenuLineItems(
  input: UpdateReservationMenuLineItemsInput,
): Promise<ReservationRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  const menusConfig = await getMenusConfig();
  const menuLineItems = buildMenuLineItemsForStaffUpdate(
    input.menuLines,
    menusConfig.offers,
    reservation.partySize,
    reservation.menuLineItems,
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "menu_selection_changed",
    meta: { lineCount: menuLineItems.length },
    publicToCustomer: true,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };

  const transact: TransactItems = [
    {
      Update: {
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression:
          "SET menuLineItems = :m, version = :nextVersion, updatedAt = :u, updatedBy = :ub",
        ConditionExpression: "version = :expectedVersion",
        ExpressionAttributeValues: {
          ":m": menuLineItems,
          ":nextVersion": input.expectedVersion + 1,
          ":u": nowIso,
          ":ub": input.updatedBy,
          ":expectedVersion": input.expectedVersion,
        },
      },
    },
    { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
  ];

  if (input.systemMessage) {
    const messageId = randomUUID();
    transact.push({
      Put: {
        TableName: RESERVATIONS_TABLE_NAME,
        Item: {
          PK: reservation.PK,
          SK: `MSG#${nowIso}#${messageId}`,
          entityType: MSG_ENTITY,
          messageId,
          reservationId: reservation.reservationId,
          authorType: "system",
          authorId: null,
          authorDisplayName: "Equipo La Cayetana",
          body: input.systemMessage,
          createdAt: nowIso,
          readByCustomerAt: null,
          readByStaffAt: nowIso,
        } satisfies ReservationMessageRecord,
      },
    });
  }

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }

  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

/** Comprobantes actuales (incl. modelo legacy S3) para edición. */
function getPrepaymentItemsForEdit(r: ReservationRecord): {
  items: PrepaymentProofItem[];
  hadLegacyOnly: boolean;
} {
  if (r.prepaymentProofItems && r.prepaymentProofItems.length > 0) {
    return {
      items: r.prepaymentProofItems.map((x) => ({ ...x })),
      hadLegacyOnly: false,
    };
  }
  if (r.prepaymentProofS3Key) {
    return {
      items: [
        {
          proofId: "legacy",
          s3Key: r.prepaymentProofS3Key,
          fileName: r.prepaymentProofFileName ?? "justificante",
          amountCents: 0,
          uploadedAt: r.prepaymentReceivedAt ?? r.updatedAt,
        },
      ],
      hadLegacyOnly: true,
    };
  }
  return { items: [], hadLegacyOnly: false };
}

export class PrepaymentProofNotFoundError extends Error {
  constructor() {
    super("No se encontró ese comprobante de señal");
    this.name = "PrepaymentProofNotFoundError";
  }
}

export interface AppendPrepaymentProofsInput {
  reservationId: string;
  expectedVersion: number;
  newItems: PrepaymentProofItem[];
  updatedBy: string;
}

/**
 * Añade comprobantes a una reserva que ya tiene señal recibida.
 * Migra un justificante legacy a `prepaymentProofItems` al fusionar.
 */
export async function appendPrepaymentProofs(
  input: AppendPrepaymentProofsInput,
): Promise<ReservationRecord> {
  if (input.newItems.length === 0) {
    throw new Error("No hay comprobantes nuevos que añadir");
  }
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  if (reservation.prepaymentStatus !== "received") {
    throw new Error(
      "Solo se pueden añadir comprobantes con la señal ya recibida.",
    );
  }
  const { items: existing, hadLegacyOnly } =
    getPrepaymentItemsForEdit(reservation);
  const merged: PrepaymentProofItem[] = [...existing, ...input.newItems];
  const now = new Date();
  const nowIso = now.toISOString();
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "prepayment_proofs_appended",
    meta: { added: input.newItems.length, total: merged.length },
    publicToCustomer: false,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };

  let updateExpr = `SET prepaymentProofItems = :ppi, version = :next, updatedAt = :u, updatedBy = :ub`;
  const values: Record<string, unknown> = {
    ":ppi": merged,
    ":next": input.expectedVersion + 1,
    ":u": nowIso,
    ":ub": input.updatedBy,
    ":expected": input.expectedVersion,
  };
  if (hadLegacyOnly) {
    updateExpr += " REMOVE prepaymentProofS3Key, prepaymentProofFileName";
  }

  const transact: TransactItems = [
    {
      Update: {
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression: updateExpr,
        ConditionExpression: "version = :expected",
        ExpressionAttributeValues: values,
      },
    },
    { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
  ];

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }
  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

export interface RemovePrepaymentProofInput {
  reservationId: string;
  expectedVersion: number;
  proofId: string;
  updatedBy: string;
}

/**
 * Elimina un comprobante: borra el fichero en S3 y su entrada en el array.
 */
export async function removePrepaymentProof(
  input: RemovePrepaymentProofInput,
): Promise<ReservationRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  if (reservation.prepaymentStatus !== "received") {
    throw new Error(
      "Solo se pueden quitar comprobantes con la señal en estado recibida.",
    );
  }
  const { items } = getPrepaymentItemsForEdit(reservation);
  const idx = items.findIndex((p) => p.proofId === input.proofId);
  if (idx < 0) {
    throw new PrepaymentProofNotFoundError();
  }
  const [removed] = items.splice(idx, 1);
  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  try {
    await deleteObject({ bucket: RESERVATION_DOCS_S3_BUCKET, key: removed.s3Key });
  } catch (e) {
    console.warn("[prepayment] no se pudo borrar S3, se anota igual en reserva", e);
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "prepayment_proof_removed",
    meta: { proofId: input.proofId, fileName: removed.fileName },
    publicToCustomer: false,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };

  const baseValues: Record<string, unknown> = {
    ":next": input.expectedVersion + 1,
    ":u": nowIso,
    ":ub": input.updatedBy,
    ":expected": input.expectedVersion,
  };
  const updateExpression =
    items.length > 0
      ? "SET prepaymentProofItems = :ppi, version = :next, updatedAt = :u, updatedBy = :ub"
      : "SET version = :next, updatedAt = :u, updatedBy = :ub REMOVE prepaymentProofItems, prepaymentProofS3Key, prepaymentProofFileName";
  const expressionValues: Record<string, unknown> =
    items.length > 0
      ? { ...baseValues, ":ppi": items }
      : baseValues;

  const transact: TransactItems = [
    {
      Update: {
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression: updateExpression,
        ConditionExpression: "version = :expected",
        ExpressionAttributeValues: expressionValues,
      },
    },
    { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
  ];

  try {
    await doc.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isTransactionConditionalFailed(err)) {
      throw new ReservationConflictError();
    }
    throw err;
  }
  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

// ─── Chat ─────────────────────────────────────────────────────────────────

export interface AddMessageInput {
  reservationId: string;
  authorType: ReservationMessageRecord["authorType"];
  authorId: string | null;
  authorDisplayName: string;
  body: string;
  documentIds?: string[];
}

export async function addReservationMessage(
  input: AddMessageInput,
): Promise<ReservationMessageRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const now = new Date();
  const nowIso = now.toISOString();
  const messageId = randomUUID();
  const body = input.body.trim();
  if (!body && (!input.documentIds || input.documentIds.length === 0)) {
    throw new Error("Mensaje vacío y sin adjuntos");
  }

  const record: ReservationMessageRecord = {
    PK: reservation.PK,
    SK: `MSG#${nowIso}#${messageId}`,
    entityType: MSG_ENTITY,
    messageId,
    reservationId: reservation.reservationId,
    authorType: input.authorType,
    authorId: input.authorId,
    authorDisplayName: input.authorDisplayName,
    body,
    createdAt: nowIso,
    documentIds: input.documentIds,
    readByCustomerAt: input.authorType === "customer" ? nowIso : null,
    readByStaffAt: input.authorType === "staff" ? nowIso : null,
  };

  // `staff` incrementa no-leídos del cliente y viceversa.
  const incStaff = input.authorType === "customer" ? 1 : 0;
  const incCustomer = input.authorType !== "customer" ? 1 : 0;

  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: record } },
        {
          Update: {
            TableName: RESERVATIONS_TABLE_NAME,
            Key: { PK: reservation.PK, SK: "META" },
            UpdateExpression: [
              "SET lastMessageAt = :t",
              "unreadForStaff = if_not_exists(unreadForStaff, :zero) + :sIncr",
              "unreadForCustomer = if_not_exists(unreadForCustomer, :zero) + :cIncr",
            ].join(", "),
            ExpressionAttributeValues: {
              ":t": nowIso,
              ":zero": 0,
              ":sIncr": incStaff,
              ":cIncr": incCustomer,
            },
          },
        },
      ],
    }),
  );

  return record;
}

export async function listReservationMessages(
  reservationId: string,
  opts: { limit?: number; ascending?: boolean } = {},
): Promise<ReservationMessageRecord[]> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const ascending = opts.ascending ?? true;
  const items: ReservationMessageRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `RES#${reservationId}`,
          ":sk": "MSG#",
        },
        ScanIndexForward: ascending,
        ExclusiveStartKey: startKey,
        Limit: opts.limit,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as ReservationMessageRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (opts.limit && items.length >= opts.limit) break;
  } while (startKey);
  return items;
}

/**
 * Marca todos los mensajes vivos como leídos por `who` en la reserva,
 * poniendo a cero el contador correspondiente. Usa un único Update
 * transaccional para evitar carreras con `addReservationMessage`.
 */
export async function markReservationMessagesRead(input: {
  reservationId: string;
  who: "customer" | "staff";
}): Promise<void> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const field =
    input.who === "customer" ? "unreadForCustomer" : "unreadForStaff";
  await doc.send(
    new UpdateCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `RES#${input.reservationId}`, SK: "META" },
      UpdateExpression: `SET ${field} = :zero`,
      ExpressionAttributeValues: { ":zero": 0 },
    }),
  );
  // Nota: los mensajes individuales no se actualizan uno a uno para no
  // generar N updates; la UI se guía por el contador agregado. Si se
  // quisiera granularidad, en PR3/4 podríamos lanzar un job asíncrono
  // que marque `readByCustomerAt` en los mensajes antiguos.
}

// ─── Notas internas (staff-only) ──────────────────────────────────────────

export interface AddNoteInput {
  reservationId: string;
  body: string;
  createdByUserId: string;
  createdByDisplayName: string;
}

export async function addReservationNote(
  input: AddNoteInput,
): Promise<ReservationNoteRecord> {
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  const body = input.body.trim();
  if (!body) throw new Error("Nota vacía");
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const nowIso = new Date().toISOString();
  const noteId = randomUUID();
  const record: ReservationNoteRecord = {
    PK: reservation.PK,
    SK: `NOTE#${nowIso}#${noteId}`,
    entityType: NOTE_ENTITY,
    noteId,
    reservationId: reservation.reservationId,
    body,
    createdAt: nowIso,
    createdByUserId: input.createdByUserId,
    createdByDisplayName: input.createdByDisplayName,
  };
  await doc.send(
    new PutCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Item: record,
    }),
  );
  return record;
}

export async function listReservationNotes(
  reservationId: string,
): Promise<ReservationNoteRecord[]> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const items: ReservationNoteRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `RES#${reservationId}`,
          ":sk": "NOTE#",
        },
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as ReservationNoteRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

// ─── Events (auditoría/timeline) ──────────────────────────────────────────

export async function listReservationEvents(
  reservationId: string,
  opts: { onlyPublic?: boolean } = {},
): Promise<ReservationEventRecord[]> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const items: ReservationEventRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `RES#${reservationId}`,
          ":sk": "EVT#",
        },
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as ReservationEventRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return opts.onlyPublic ? items.filter((e) => e.publicToCustomer) : items;
}

// ─── Queries de listado ───────────────────────────────────────────────────

/**
 * Lista las reservas de un cliente (userId o guestId) ordenadas por hora
 * de la reserva ascendente (próximas primero). Usa GSI `by-customer`.
 */
export async function listReservationsByCustomer(input: {
  userId?: string;
  guestId?: string;
}): Promise<ReservationRecord[]> {
  if (!input.userId && !input.guestId) return [];
  const gsiPk = input.userId ? `USER#${input.userId}` : `GUEST#${input.guestId}`;
  return queryGsi(GSI_BY_CUSTOMER, gsiPk, { ascending: true });
}

/**
 * Devuelve las reservas ACTIVAS (status ∈ ACTIVE) del cliente cuya
 * `reservationStartAtIso > now`. Es el input de la pantalla de decisión.
 */
export async function findActiveReservationsForIdentity(input: {
  userId?: string;
  guestId?: string;
  now?: Date;
}): Promise<ReservationRecord[]> {
  const now = input.now ?? new Date();
  const all = await listReservationsByCustomer(input);
  const iso = now.toISOString();
  return all.filter(
    (r) => isActiveReservationStatus(r.status) && r.reservationStartAtIso > iso,
  );
}

/**
 * Reservas (cualquier estado) de un día concreto. Pensado para el tablero
 * de servicio del staff. Ordenadas por hora ascendente dentro del día.
 */
export async function listReservationsByDate(
  dateKey: string,
): Promise<ReservationRecord[]> {
  return queryGsi(GSI_BY_DATE, `DATE#${dateKey}`, { ascending: true });
}

/**
 * Reservas en un estado concreto ordenadas por hora ascendente. Permite
 * al tablero filtrar por ejemplo `STATUS#pending`.
 */
export async function listReservationsByStatus(
  status: ReservationStatus,
  opts: { limit?: number } = {},
): Promise<ReservationRecord[]> {
  return queryGsi(GSI_BY_STATUS_DATE, `STATUS#${status}`, {
    ascending: true,
    limit: opts.limit,
  });
}

/**
 * Reservas en estados del pipeline cuya `reservationDate` (local) pertenece
 * al año calendario. Consulta el GSI por estado **sin tope** en cada
 * partición: en volúmenes extremos el coste en RCU crecerá.
 */
export async function listActiveReservationsForCalendarYear(
  year: number,
): Promise<ReservationRecord[]> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return [];
  }
  const prefix = `${year}-`;
  const groups = await Promise.all(
    ACTIVE_RESERVATION_STATUSES.map((s) => listReservationsByStatus(s, {})),
  );
  const byId = new Map<string, ReservationRecord>();
  for (const g of groups) {
    for (const r of g) {
      if (r.reservationDate.startsWith(prefix)) {
        byId.set(r.reservationId, r);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.reservationStartAtIso.localeCompare(b.reservationStartAtIso),
  );
}

/**
 * Reservas cuya fecha local de servicio es `dateKey` (yyyy-MM-dd) y
 * cuyo estado es activo.
 */
export async function listActiveReservationsForDate(
  dateKey: string,
): Promise<ReservationRecord[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  const items = await listReservationsByDate(dateKey);
  return items
    .filter((r) => isActiveReservationStatus(r.status))
    .sort((a, b) =>
      a.reservationStartAtIso.localeCompare(b.reservationStartAtIso),
    );
}

/**
 * Busca reservas cuyo email coincida (normalizado) con el dado. Usa
 * `GSI_BY_EMAIL` con prefijo `RES#` en el SK para excluir el ítem GUEST.
 */
export async function listReservationsByEmail(
  email: string,
  opts: { limit?: number } = {},
): Promise<ReservationRecord[]> {
  const normalizedEmail = normalizeEmail(email);
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const items: ReservationRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        IndexName: GSI_BY_EMAIL,
        KeyConditionExpression: "GSI4PK = :pk AND begins_with(GSI4SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `EMAIL#${normalizedEmail}`,
          ":sk": "RES#",
        },
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
        Limit: opts.limit,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as ReservationRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (opts.limit && items.length >= opts.limit) break;
  } while (startKey);
  return items;
}

async function findActiveReservationByEmailAndDate(
  normalizedEmail: string,
  reservationDate: string,
): Promise<ReservationRecord | null> {
  const all = await listReservationsByEmail(normalizedEmail);
  const match = all.find(
    (r) =>
      r.reservationDate === reservationDate &&
      isActiveReservationStatus(r.status),
  );
  return match ?? null;
}

export interface UpdateReservationTableInput {
  reservationId: string;
  expectedVersion: number;
  /** `null` o `""` borra la mesa. */
  tableLabel: string | null;
  updatedBy: string;
}

/**
 * Asigna o borra la etiqueta de mesa (trabajo de sala). Incluye evento
 * de auditoría; no afecta a GSI.
 */
export async function updateReservationTable(
  input: UpdateReservationTableInput,
): Promise<ReservationRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const reservation = await getReservationById(input.reservationId);
  if (!reservation) throw new ReservationNotFoundError();
  if (reservation.version !== input.expectedVersion) {
    throw new ReservationConflictError();
  }
  const nextLabel =
    input.tableLabel == null || input.tableLabel.trim() === ""
      ? undefined
      : input.tableLabel.trim();
  if (reservation.tableLabel === nextLabel) {
    return reservation;
  }
  const nowIso = new Date().toISOString();
  const hasLabel = nextLabel != null;
  const updateExpr = hasLabel
    ? "SET #tl = :tl, version = :nextVersion, updatedAt = :u, updatedBy = :ub"
    : "REMOVE #tl SET version = :nextVersion, updatedAt = :u, updatedBy = :ub";
  const eventId = randomUUID();
  const event: ReservationEventRecord = {
    PK: reservation.PK,
    SK: `EVT#${nowIso}#${eventId}`,
    entityType: EVT_ENTITY,
    eventId,
    reservationId: reservation.reservationId,
    kind: "table_label_set",
    meta: {
      from: reservation.tableLabel,
      to: nextLabel,
    },
    publicToCustomer: false,
    createdAt: nowIso,
    createdBy: input.updatedBy,
  };
  const values: Record<string, unknown> = {
    ":nextVersion": input.expectedVersion + 1,
    ":u": nowIso,
    ":ub": input.updatedBy,
    ":expectedVersion": input.expectedVersion,
  };
  if (hasLabel) {
    values[":tl"] = nextLabel;
  }
  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: RESERVATIONS_TABLE_NAME,
            Key: { PK: reservation.PK, SK: reservation.SK },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: { "#tl": "tableLabel" },
            ExpressionAttributeValues: values,
            ConditionExpression: "version = :expectedVersion",
          },
        },
        { Put: { TableName: RESERVATIONS_TABLE_NAME, Item: event } },
      ],
    }),
  );
  if (reservation.guestId) {
    await bumpGuestSessionVersion(reservation.guestId);
  }
  const updated = await getReservationById(reservation.reservationId);
  if (!updated) throw new ReservationNotFoundError();
  return updated;
}

// ─── Helpers genéricos ────────────────────────────────────────────────────

async function queryGsi(
  indexName: string,
  gsiPk: string,
  opts: { ascending?: boolean; limit?: number } = {},
): Promise<ReservationRecord[]> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const pkAttr = gsiPkAttrFor(indexName);
  const items: ReservationRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        IndexName: indexName,
        KeyConditionExpression: `${pkAttr} = :pk`,
        FilterExpression: "entityType = :et",
        ExpressionAttributeValues: {
          ":pk": gsiPk,
          ":et": RES_ENTITY,
        },
        ScanIndexForward: opts.ascending ?? true,
        ExclusiveStartKey: startKey,
        Limit: opts.limit,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as ReservationRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (opts.limit && items.length >= opts.limit) break;
  } while (startKey);
  return items;
}

function gsiPkAttrFor(indexName: string): string {
  switch (indexName) {
    case GSI_BY_STATUS_DATE:
      return "GSI1PK";
    case GSI_BY_DATE:
      return "GSI2PK";
    case GSI_BY_CUSTOMER:
      return "GSI3PK";
    case GSI_BY_EMAIL:
      return "GSI4PK";
    default:
      throw new Error(`Índice desconocido ${indexName}`);
  }
}

function isConditionalFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: string }).name) : "";
  return name === "ConditionalCheckFailedException";
}

function isTransactionConditionalFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: string }).name) : "";
  if (name === "TransactionCanceledException") return true;
  return isConditionalFailed(err);
}

// ─── Helpers de conveniencia para el frontend ────────────────────────────

/**
 * Calcula el nº de comensales ya reservados (todas las reservas activas)
 * en un día concreto. Útil para filtrar slots por capacidad en PR3/4.
 */
export async function sumPartySizeByDate(dateKey: string): Promise<number> {
  const items = await listReservationsByDate(dateKey);
  return items
    .filter((r) => isActiveReservationStatus(r.status))
    .reduce((acc, r) => acc + r.partySize, 0);
}

/** Fecha local (yyyy-MM-dd) del instante actual en la zona de la config. */
export function currentReservationDateKey(
  now: Date,
  timezone: string,
): string {
  return formatLocalDate(now, timezone);
}
