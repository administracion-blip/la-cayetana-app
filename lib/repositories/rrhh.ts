/**
 * Repositorio del módulo RRHH (tabla `RRHH_TABLE_NAME`).
 *
 * En esta fase cubre:
 *  - Invitaciones de alta de trabajador (`RRHH_WORKER_INVITE`).
 *  - Ficha laboral con datos sensibles (`RRHH_WORKER_PROFILE`).
 *
 * Los datos sensibles (DNI/NSS/IBAN/dirección) viven aquí, separados de la
 * cuenta de socio en la tabla de usuarios. El acceso se controla en las
 * rutas con `requireRrhhManageForApi` / `requireRrhhViewForApi`.
 */

import { randomUUID } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DEFAULT_TIMEZONE } from "@/lib/datetime";
import { getDocClient } from "@/lib/dynamo";
import { requireRrhhEnv } from "@/lib/env";
import {
  DEFAULT_POSITIONS,
  isPositionColor,
  sortPositions,
  type PositionColor,
  type RrhhPosition,
} from "@/lib/rrhh/positions";
import type {
  RrhhAccessLogRecord,
  RrhhClockRecord,
  RrhhConfigRecord,
  RrhhPositionsRecord,
  RrhhShiftRecord,
  RrhhWorkerDocumentRecord,
  RrhhWorkerInviteRecord,
  RrhhWorkerProfileRecord,
} from "@/types/models";

const WORKER_INVITE_ENTITY: RrhhWorkerInviteRecord["entityType"] =
  "RRHH_WORKER_INVITE";
const WORKER_PROFILE_ENTITY: RrhhWorkerProfileRecord["entityType"] =
  "RRHH_WORKER_PROFILE";

const GSI_BY_STATUS = "by-status";

/** Validez por defecto del enlace de alta de trabajador (7 días). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function workerInvitePk(tokenHashHex: string): `WINVITE#${string}` {
  return `WINVITE#${tokenHashHex}`;
}

function workerProfilePk(userId: string): `WORKER#${string}` {
  return `WORKER#${userId}`;
}

// ─── Invitaciones ─────────────────────────────────────────────────────────

export async function saveWorkerInvite(input: {
  tokenHashHex: string;
  email: string;
  name?: string;
  phone?: string;
  invitedByUserId: string;
}): Promise<RrhhWorkerInviteRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

  const item: RrhhWorkerInviteRecord = {
    PK: workerInvitePk(input.tokenHashHex),
    SK: "META",
    entityType: WORKER_INVITE_ENTITY,
    email: input.email,
    invitedByUserId: input.invitedByUserId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlEpoch: Math.floor(expiresAt.getTime() / 1000),
  };
  if (input.name?.trim()) item.name = input.name.trim();
  if (input.phone?.trim()) item.phone = input.phone.trim();

  await doc.send(
    new PutCommand({ TableName: RRHH_TABLE_NAME, Item: item }),
  );
  return item;
}

export async function getWorkerInvite(
  tokenHashHex: string,
): Promise<RrhhWorkerInviteRecord | null> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerInvitePk(tokenHashHex), SK: "META" },
    }),
  );
  const item = res.Item as RrhhWorkerInviteRecord | undefined;
  if (!item || item.entityType !== WORKER_INVITE_ENTITY) return null;
  return item;
}

export async function deleteWorkerInvite(tokenHashHex: string): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  await doc.send(
    new DeleteCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerInvitePk(tokenHashHex), SK: "META" },
    }),
  );
}

export function isWorkerInviteExpired(record: RrhhWorkerInviteRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}

/**
 * Marca la invitación como consumida (alta completada) sin borrarla, para
 * que el trabajador pueda subir sus documentos hasta que caduque por TTL.
 */
export async function markWorkerInviteConsumed(
  tokenHashHex: string,
  userId: string,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  await doc.send(
    new UpdateCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerInvitePk(tokenHashHex), SK: "META" },
      UpdateExpression:
        "SET consumedUserId = :uid, consumedAt = :at",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":at": new Date().toISOString(),
      },
    }),
  );
}

// ─── Ficha laboral ─────────────────────────────────────────────────────────

export type CreateWorkerProfileInput = {
  userId: string;
  nameSnapshot: string;
  emailSnapshot: string;
  dni: string;
  socialSecurityNumber: string;
  iban: string;
  address: string;
  city: string;
  postalCode: string;
  position?: string;
};

export async function createWorkerProfile(
  input: CreateWorkerProfileInput,
): Promise<RrhhWorkerProfileRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const nowIso = new Date().toISOString();
  const nameLower = input.nameSnapshot.trim().toLowerCase();

  const record: RrhhWorkerProfileRecord = {
    PK: workerProfilePk(input.userId),
    SK: "PROFILE",
    GSI3PK: "WORKERS",
    GSI3SK: `${nameLower}#${input.userId}`,
    entityType: WORKER_PROFILE_ENTITY,
    userId: input.userId,
    nameSnapshot: input.nameSnapshot.trim(),
    emailSnapshot: input.emailSnapshot.trim(),
    dni: input.dni.trim(),
    socialSecurityNumber: input.socialSecurityNumber.trim(),
    iban: input.iban.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    position: input.position?.trim() || undefined,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await doc.send(
    new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }),
  );
  return record;
}

export type UpdateWorkerProfileInput = {
  dni: string;
  socialSecurityNumber: string;
  iban: string;
  address: string;
  city: string;
  postalCode: string;
  position?: string;
};

/** Actualiza los datos laborales (sensibles) de la ficha de un trabajador. */
export async function updateWorkerProfileFields(
  userId: string,
  input: UpdateWorkerProfileInput,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  // Varios de estos nombres (p.ej. `position`) son palabras reservadas en
  // DynamoDB, así que se referencian con alias de `ExpressionAttributeNames`.
  const names: Record<string, string> = {
    "#dni": "dni",
    "#nss": "socialSecurityNumber",
    "#iban": "iban",
    "#address": "address",
    "#city": "city",
    "#postalCode": "postalCode",
    "#updatedAt": "updatedAt",
    "#position": "position",
  };
  const sets = [
    "#dni = :dni",
    "#nss = :nss",
    "#iban = :iban",
    "#address = :address",
    "#city = :city",
    "#postalCode = :postalCode",
    "#updatedAt = :u",
  ];
  const values: Record<string, unknown> = {
    ":dni": input.dni.trim(),
    ":nss": input.socialSecurityNumber.trim(),
    ":iban": input.iban.trim(),
    ":address": input.address.trim(),
    ":city": input.city.trim(),
    ":postalCode": input.postalCode.trim(),
    ":u": new Date().toISOString(),
  };
  const position = input.position?.trim();
  let removeClause = "";
  if (position) {
    sets.push("#position = :position");
    values[":position"] = position;
  } else {
    removeClause = " REMOVE #position";
  }

  await doc.send(
    new UpdateCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerProfilePk(userId), SK: "PROFILE" },
      ConditionExpression: "attribute_exists(PK)",
      UpdateExpression: `SET ${sets.join(", ")}${removeClause}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** Activa o da de baja a un trabajador en RRHH (no borra la ficha). */
export async function setWorkerProfileActive(
  userId: string,
  active: boolean,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  await doc.send(
    new UpdateCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerProfilePk(userId), SK: "PROFILE" },
      ConditionExpression: "attribute_exists(PK)",
      UpdateExpression: "SET #active = :a, #updatedAt = :u",
      ExpressionAttributeNames: { "#active": "active", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: {
        ":a": active,
        ":u": new Date().toISOString(),
      },
    }),
  );
}

export async function getWorkerProfile(
  userId: string,
): Promise<RrhhWorkerProfileRecord | null> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerProfilePk(userId), SK: "PROFILE" },
    }),
  );
  const item = res.Item as RrhhWorkerProfileRecord | undefined;
  if (!item || item.entityType !== WORKER_PROFILE_ENTITY) return null;
  return item;
}

/** Lista todas las fichas de trabajador ordenadas por nombre (GSI by-status). */
export async function listWorkerProfiles(): Promise<
  RrhhWorkerProfileRecord[]
> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const items: RrhhWorkerProfileRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: RRHH_TABLE_NAME,
        IndexName: GSI_BY_STATUS,
        KeyConditionExpression: "GSI3PK = :pk",
        ExpressionAttributeValues: { ":pk": "WORKERS" },
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of res.Items ?? []) {
      items.push(it as RrhhWorkerProfileRecord);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

// ─── Documentos ────────────────────────────────────────────────────────────

export type CreateWorkerDocumentInput = Omit<
  RrhhWorkerDocumentRecord,
  "PK" | "SK" | "entityType" | "docId" | "uploadedAt"
> & { docId?: string };

export async function createWorkerDocument(
  input: CreateWorkerDocumentInput,
): Promise<RrhhWorkerDocumentRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const docId = input.docId ?? randomUUID();

  const record: RrhhWorkerDocumentRecord = {
    PK: workerProfilePk(input.userId),
    SK: `DOC#${docId}`,
    entityType: "RRHH_WORKER_DOCUMENT",
    docId,
    userId: input.userId,
    kind: input.kind,
    side: input.side,
    s3Key: input.s3Key,
    contentType: input.contentType,
    size: input.size,
    source: input.source,
    uploadedByUserId: input.uploadedByUserId,
    uploadedAt: new Date().toISOString(),
  };
  if (input.originalName) record.originalName = input.originalName;

  await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  return record;
}

export async function listWorkerDocuments(
  userId: string,
): Promise<RrhhWorkerDocumentRecord[]> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: RRHH_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": workerProfilePk(userId),
        ":sk": "DOC#",
      },
    }),
  );
  return (res.Items ?? []).map((it) => it as RrhhWorkerDocumentRecord);
}

export async function getWorkerDocument(
  userId: string,
  docId: string,
): Promise<RrhhWorkerDocumentRecord | null> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerProfilePk(userId), SK: `DOC#${docId}` },
    }),
  );
  const item = res.Item as RrhhWorkerDocumentRecord | undefined;
  if (!item || item.entityType !== "RRHH_WORKER_DOCUMENT") return null;
  return item;
}

export async function deleteWorkerDocumentRecord(
  userId: string,
  docId: string,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  await doc.send(
    new DeleteCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: workerProfilePk(userId), SK: `DOC#${docId}` },
    }),
  );
}

// ─── Auditoría ─────────────────────────────────────────────────────────────

export async function recordRrhhAccess(
  entry: Omit<RrhhAccessLogRecord, "PK" | "SK" | "entityType" | "at"> & {
    at?: string;
  },
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const at = entry.at ?? new Date().toISOString();
  const record: RrhhAccessLogRecord = {
    PK: workerProfilePk(entry.userId),
    SK: `AUDIT#${at}#${randomUUID().slice(0, 8)}`,
    entityType: "RRHH_ACCESS_LOG",
    userId: entry.userId,
    action: entry.action,
    actorUserId: entry.actorUserId,
    at,
  };
  if (entry.docId) record.docId = entry.docId;

  try {
    await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  } catch (err) {
    // La auditoría no debe tumbar la operación principal; se registra y sigue.
    console.error("[rrhh][audit] no se pudo registrar el acceso", err);
  }
}

// ─── Cuadrantes (turnos) ────────────────────────────────────────────────────

export type CreateShiftInput = {
  userId: string;
  workerNameSnapshot: string;
  jornadaDate: string;
  start: string;
  end: string;
  endsNextDay: boolean;
  note?: string;
  createdByUserId: string;
};

export async function createShift(
  input: CreateShiftInput,
): Promise<RrhhShiftRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const shiftId = randomUUID();
  const nowIso = new Date().toISOString();

  const record: RrhhShiftRecord = {
    PK: workerProfilePk(input.userId),
    SK: `SHIFT#${input.jornadaDate}#${shiftId}`,
    entityType: "RRHH_SHIFT",
    shiftId,
    userId: input.userId,
    workerNameSnapshot: input.workerNameSnapshot,
    jornadaDate: input.jornadaDate,
    start: input.start,
    end: input.end,
    endsNextDay: input.endsNextDay,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (input.note) record.note = input.note;

  await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  return record;
}

/** Turnos de un trabajador con `jornadaDate` en `[from, to]` (inclusive). */
export async function listShiftsForWorkerRange(
  userId: string,
  from: string,
  to: string,
): Promise<RrhhShiftRecord[]> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: RRHH_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :a AND :b",
      ExpressionAttributeValues: {
        ":pk": workerProfilePk(userId),
        ":a": `SHIFT#${from}`,
        ":b": `SHIFT#${to}#\uffff`,
      },
    }),
  );
  return (res.Items ?? []).map((it) => it as RrhhShiftRecord);
}

/** Turnos de varios trabajadores en un rango de jornadas (p. ej. una semana). */
export async function listShiftsForWorkersRange(
  userIds: string[],
  from: string,
  to: string,
): Promise<RrhhShiftRecord[]> {
  if (userIds.length === 0) return [];
  const groups = await Promise.all(
    userIds.map((uid) => listShiftsForWorkerRange(uid, from, to)),
  );
  return groups.flat();
}

export async function deleteShift(
  userId: string,
  jornadaDate: string,
  shiftId: string,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  await doc.send(
    new DeleteCommand({
      TableName: RRHH_TABLE_NAME,
      Key: {
        PK: workerProfilePk(userId),
        SK: `SHIFT#${jornadaDate}#${shiftId}`,
      },
    }),
  );
}

export type UpdateShiftInput = {
  start: string;
  end: string;
  endsNextDay: boolean;
  note?: string;
};

/** Actualiza horario y nota de un turno existente. */
export async function updateShift(
  userId: string,
  jornadaDate: string,
  shiftId: string,
  input: UpdateShiftInput,
): Promise<void> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const names: Record<string, string> = {
    "#start": "start",
    "#end": "end",
    "#endsNextDay": "endsNextDay",
    "#updatedAt": "updatedAt",
    "#note": "note",
  };
  const sets = [
    "#start = :start",
    "#end = :end",
    "#endsNextDay = :ends",
    "#updatedAt = :u",
  ];
  const values: Record<string, unknown> = {
    ":start": input.start,
    ":end": input.end,
    ":ends": input.endsNextDay,
    ":u": new Date().toISOString(),
  };
  let removeClause = "";
  const note = input.note?.trim();
  if (note) {
    sets.push("#note = :note");
    values[":note"] = note;
  } else {
    removeClause = " REMOVE #note";
  }
  await doc.send(
    new UpdateCommand({
      TableName: RRHH_TABLE_NAME,
      Key: {
        PK: workerProfilePk(userId),
        SK: `SHIFT#${jornadaDate}#${shiftId}`,
      },
      UpdateExpression: `SET ${sets.join(", ")}${removeClause}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

// ─── Configuración ───────────────────────────────────────────────────────────

const DEFAULT_JORNADA_START_HOUR = 6;
const DEFAULT_TOLERANCE_MIN = 10;

export async function getRrhhConfig(): Promise<RrhhConfigRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "RRHH" },
    }),
  );
  const item = res.Item as RrhhConfigRecord | undefined;
  if (item && item.entityType === "RRHH_CONFIG") {
    return { ...item, toleranceMin: item.toleranceMin ?? DEFAULT_TOLERANCE_MIN };
  }
  return {
    PK: "CONFIG",
    SK: "RRHH",
    entityType: "RRHH_CONFIG",
    jornadaStartHour: DEFAULT_JORNADA_START_HOUR,
    toleranceMin: DEFAULT_TOLERANCE_MIN,
    timezone: DEFAULT_TIMEZONE,
    updatedAt: new Date(0).toISOString(),
  };
}

// ─── Fichajes ────────────────────────────────────────────────────────────────

/** Último fichaje del trabajador (el de `clockInAt` más reciente). */
export async function getLatestClockForWorker(
  userId: string,
): Promise<RrhhClockRecord | null> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: RRHH_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": workerProfilePk(userId),
        ":sk": "CLOCK#",
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const item = (res.Items ?? [])[0] as RrhhClockRecord | undefined;
  if (!item || item.entityType !== "RRHH_CLOCK") return null;
  return item;
}

export async function createClockIn(input: {
  userId: string;
  workerNameSnapshot: string;
  clockInAt: string;
  jornadaDate: string;
}): Promise<RrhhClockRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const clockId = randomUUID();
  const record: RrhhClockRecord = {
    PK: workerProfilePk(input.userId),
    SK: `CLOCK#${input.clockInAt}#${clockId}`,
    entityType: "RRHH_CLOCK",
    clockId,
    userId: input.userId,
    workerNameSnapshot: input.workerNameSnapshot,
    clockInAt: input.clockInAt,
    jornadaDate: input.jornadaDate,
    createdAt: input.clockInAt,
    updatedAt: input.clockInAt,
  };
  await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  return record;
}

/** Cierra un fichaje abierto (salida). Falla si ya estaba cerrado. */
export async function closeClockOut(input: {
  userId: string;
  clockInAt: string;
  clockId: string;
  clockOutAt: string;
  comment?: string;
  autoClosed?: boolean;
}): Promise<RrhhClockRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const sets = ["clockOutAt = :out", "updatedAt = :out"];
  const values: Record<string, unknown> = { ":out": input.clockOutAt };
  if (input.comment) {
    sets.push("outComment = :c");
    values[":c"] = input.comment;
  }
  if (input.autoClosed) {
    sets.push("autoClosed = :ac");
    values[":ac"] = true;
  }
  const res = await doc.send(
    new UpdateCommand({
      TableName: RRHH_TABLE_NAME,
      Key: {
        PK: workerProfilePk(input.userId),
        SK: `CLOCK#${input.clockInAt}#${input.clockId}`,
      },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ConditionExpression: "attribute_not_exists(clockOutAt)",
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as RrhhClockRecord;
}

/** Fichajes de un trabajador con `clockInAt` dentro de `[fromIso, toIso]`. */
export async function listClockForWorkerRange(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<RrhhClockRecord[]> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new QueryCommand({
      TableName: RRHH_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :a AND :b",
      ExpressionAttributeValues: {
        ":pk": workerProfilePk(userId),
        ":a": `CLOCK#${fromIso}`,
        ":b": `CLOCK#${toIso}#\uffff`,
      },
    }),
  );
  return (res.Items ?? []).map((it) => it as RrhhClockRecord);
}

/** Actualiza la config RRHH fusionando los campos indicados (parcial). */
export async function updateRrhhConfig(input: {
  jornadaStartHour?: number;
  toleranceMin?: number;
  actorUserId: string;
}): Promise<RrhhConfigRecord> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const current = await getRrhhConfig();
  const record: RrhhConfigRecord = {
    PK: "CONFIG",
    SK: "RRHH",
    entityType: "RRHH_CONFIG",
    jornadaStartHour:
      typeof input.jornadaStartHour === "number"
        ? Math.min(23, Math.max(0, Math.floor(input.jornadaStartHour)))
        : current.jornadaStartHour,
    toleranceMin:
      typeof input.toleranceMin === "number"
        ? Math.min(120, Math.max(0, Math.floor(input.toleranceMin)))
        : current.toleranceMin,
    timezone: DEFAULT_TIMEZONE,
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.actorUserId,
  };
  await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  return record;
}

// ─── Puestos (catálogo) ──────────────────────────────────────────────────────

/** Lista el catálogo de puestos; devuelve los valores por defecto si no existe. */
export async function getPositions(): Promise<RrhhPosition[]> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RRHH_TABLE_NAME,
      Key: { PK: "CONFIG", SK: "POSITIONS" },
    }),
  );
  const item = res.Item as RrhhPositionsRecord | undefined;
  if (item && item.entityType === "RRHH_POSITIONS" && item.positions.length) {
    return item.positions
      .map((p) => ({
        name: p.name,
        color: isPositionColor(p.color) ? p.color : "sky",
      }))
      .sort(sortPositions);
  }
  return [...DEFAULT_POSITIONS];
}

/** Añade un puesto al catálogo (idempotente por nombre, sin distinguir caso). */
export async function addPosition(input: {
  name: string;
  color: PositionColor;
  actorUserId: string;
}): Promise<RrhhPosition[]> {
  const doc = getDocClient();
  const { RRHH_TABLE_NAME } = requireRrhhEnv();
  const name = input.name.trim();
  const current = await getPositions();
  if (current.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return current;
  }
  const next = [...current, { name, color: input.color }].sort(sortPositions);
  const record: RrhhPositionsRecord = {
    PK: "CONFIG",
    SK: "POSITIONS",
    entityType: "RRHH_POSITIONS",
    positions: next,
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.actorUserId,
  };
  await doc.send(new PutCommand({ TableName: RRHH_TABLE_NAME, Item: record }));
  return next;
}
