/**
 * Repositorio de documentos del módulo de Reservas (PDFs de carta, menús,
 * condiciones de prepago, etc.).
 *
 * Los archivos viven en S3 (bucket `RESERVATION_DOCS_S3_BUCKET`, privado)
 * y los metadatos en la tabla `la_cayetana_reservations` con
 * `PK = "DOC#<documentId>"`, `SK = "META"`.
 *
 * Se sirven al cliente a través de un endpoint proxy
 * `/api/reservations/documents/:id/file` para no exponer S3 directamente.
 */

import { randomUUID } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "@/lib/dynamo";
import { requireReservationsEnv } from "@/lib/env";
import {
  deleteObject,
  getObjectAsBuffer,
  putObject,
} from "@/lib/s3";
import type {
  ReservationDocumentKind,
  ReservationDocumentRecord,
} from "@/types/models";

const ENTITY: ReservationDocumentRecord["entityType"] = "RESERVATION_DOCUMENT";

export class ReservationDocumentNotFoundError extends Error {
  constructor() {
    super("Documento de reserva no encontrado");
    this.name = "ReservationDocumentNotFoundError";
  }
}

export interface CreateReservationDocumentInput {
  kind: ReservationDocumentKind;
  title: string;
  description?: string;
  /** Contenido binario del PDF (se sube a S3 aquí dentro). */
  body: Buffer;
  contentType: string;
  visibleToCustomer: boolean;
  sortOrder: number;
  createdByUserId: string;
}

export async function createReservationDocument(
  input: CreateReservationDocumentInput,
): Promise<ReservationDocumentRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME, RESERVATION_DOCS_S3_BUCKET } =
    requireReservationsEnv();
  const now = new Date().toISOString();
  const documentId = randomUUID();
  const s3Key = buildS3Key(documentId, input.contentType);
  // Primero subimos a S3 y después registramos el ítem: si falla Dynamo
  // quedaría un huérfano en S3 que limpiamos con un best-effort delete.
  await putObject({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key: s3Key,
    body: input.body,
    contentType: input.contentType,
    cacheControl: "private, max-age=300",
  });
  const record: ReservationDocumentRecord = {
    PK: `DOC#${documentId}`,
    SK: "META",
    entityType: ENTITY,
    documentId,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description?.trim(),
    s3Key,
    contentType: input.contentType,
    sizeBytes: input.body.byteLength,
    visibleToCustomer: input.visibleToCustomer,
    sortOrder: Math.max(0, Math.floor(input.sortOrder)),
    createdAt: now,
    createdByUserId: input.createdByUserId,
    updatedAt: now,
  };
  try {
    await doc.send(
      new PutCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        Item: record,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err) {
    // Rollback best-effort del objeto S3 para no dejar basura.
    try {
      await deleteObject({ bucket: RESERVATION_DOCS_S3_BUCKET, key: s3Key });
    } catch (cleanupErr) {
      console.warn(
        "[reservation-documents] No se pudo limpiar S3 tras fallo en Dynamo",
        cleanupErr,
      );
    }
    throw err;
  }
  return record;
}

export async function getReservationDocument(
  documentId: string,
): Promise<ReservationDocumentRecord | null> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const res = await doc.send(
    new GetCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `DOC#${documentId}`, SK: "META" },
    }),
  );
  const item = res.Item as ReservationDocumentRecord | undefined;
  if (!item || item.entityType !== ENTITY) return null;
  return item;
}

export interface UpdateReservationDocumentInput {
  title?: string;
  description?: string;
  kind?: ReservationDocumentKind;
  visibleToCustomer?: boolean;
  sortOrder?: number;
  updatedByUserId: string;
}

export async function updateReservationDocument(
  documentId: string,
  patch: UpdateReservationDocumentInput,
): Promise<ReservationDocumentRecord> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const now = new Date().toISOString();
  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
    "#updatedBy": "updatedByUserId",
  };
  const values: Record<string, unknown> = {
    ":updatedAt": now,
    ":updatedBy": patch.updatedByUserId,
  };
  const sets: string[] = ["#updatedAt = :updatedAt", "#updatedBy = :updatedBy"];
  function add(field: string, value: unknown) {
    if (value === undefined) return;
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    sets.push(`#${field} = :${field}`);
  }
  add("title", patch.title?.trim());
  add("description", patch.description?.trim());
  add("kind", patch.kind);
  add("visibleToCustomer", patch.visibleToCustomer);
  add(
    "sortOrder",
    patch.sortOrder === undefined
      ? undefined
      : Math.max(0, Math.floor(patch.sortOrder)),
  );

  try {
    const res = await doc.send(
      new UpdateCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: `DOC#${documentId}`, SK: "META" },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    const item = res.Attributes as ReservationDocumentRecord | undefined;
    if (!item) throw new ReservationDocumentNotFoundError();
    return item;
  } catch (err) {
    if (isConditionalFailed(err)) throw new ReservationDocumentNotFoundError();
    throw err;
  }
}

/**
 * Sustituye el contenido binario de un documento existente (p. ej. para
 * subir una nueva versión del PDF). Mantiene el mismo `documentId` y
 * actualiza `s3Key` + `sizeBytes` + `updatedAt`.
 */
export async function replaceReservationDocumentFile(
  documentId: string,
  input: {
    body: Buffer;
    contentType: string;
    updatedByUserId: string;
  },
): Promise<ReservationDocumentRecord> {
  const existing = await getReservationDocument(documentId);
  if (!existing) throw new ReservationDocumentNotFoundError();
  const { RESERVATIONS_TABLE_NAME, RESERVATION_DOCS_S3_BUCKET } =
    requireReservationsEnv();
  const newKey = buildS3Key(documentId, input.contentType);
  await putObject({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key: newKey,
    body: input.body,
    contentType: input.contentType,
    cacheControl: "private, max-age=300",
  });
  const now = new Date().toISOString();
  const doc = getDocClient();
  const res = await doc.send(
    new UpdateCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `DOC#${documentId}`, SK: "META" },
      UpdateExpression:
        "SET s3Key = :k, contentType = :ct, sizeBytes = :sz, updatedAt = :u, updatedByUserId = :ub",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: {
        ":k": newKey,
        ":ct": input.contentType,
        ":sz": input.body.byteLength,
        ":u": now,
        ":ub": input.updatedByUserId,
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const updated = res.Attributes as ReservationDocumentRecord | undefined;
  if (!updated) throw new ReservationDocumentNotFoundError();
  // Borrado best-effort del antiguo objeto S3 (una vez confirmado el cambio
  // en Dynamo). Si falla, dejamos el huérfano — mejor huérfano que 404.
  if (existing.s3Key !== newKey) {
    try {
      await deleteObject({
        bucket: RESERVATION_DOCS_S3_BUCKET,
        key: existing.s3Key,
      });
    } catch (err) {
      console.warn(
        "[reservation-documents] No se pudo borrar versión antigua en S3",
        err,
      );
    }
  }
  return updated;
}

export async function deleteReservationDocument(
  documentId: string,
): Promise<void> {
  const existing = await getReservationDocument(documentId);
  if (!existing) throw new ReservationDocumentNotFoundError();
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME, RESERVATION_DOCS_S3_BUCKET } =
    requireReservationsEnv();
  await doc.send(
    new DeleteCommand({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { PK: `DOC#${documentId}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK)",
    }),
  );
  try {
    await deleteObject({
      bucket: RESERVATION_DOCS_S3_BUCKET,
      key: existing.s3Key,
    });
  } catch (err) {
    console.warn(
      "[reservation-documents] No se pudo borrar archivo en S3 tras delete Dynamo",
      err,
    );
  }
}

/**
 * Devuelve el buffer del PDF desde S3 (para el endpoint proxy). Si el
 * objeto no existe o el ítem ya no está, devuelve `null`.
 */
export async function getReservationDocumentFile(
  documentId: string,
): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  const existing = await getReservationDocument(documentId);
  if (!existing) return null;
  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  const file = await getObjectAsBuffer({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key: existing.s3Key,
  });
  if (!file) return null;
  const filename = buildDownloadFilename(existing);
  return {
    buffer: file.buffer,
    contentType: file.contentType || existing.contentType,
    filename,
  };
}

/**
 * Lista TODOS los documentos (para admin). No paginamos: el conjunto es
 * reducido (decenas de PDFs como mucho). Scan con filtro por entityType.
 */
export async function listAllReservationDocuments(): Promise<
  ReservationDocumentRecord[]
> {
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const items: ReservationDocumentRecord[] = [];
  let sk: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        FilterExpression: "#et = :et",
        ExpressionAttributeNames: { "#et": "entityType" },
        ExpressionAttributeValues: { ":et": ENTITY },
        ExclusiveStartKey: sk,
      }),
    );
    for (const item of res.Items ?? []) {
      items.push(item as ReservationDocumentRecord);
    }
    sk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (sk);
  items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, "es");
  });
  return items;
}

/**
 * Lista solo los documentos visibles al cliente (los que puede ver en el
 * chat / pantalla de reserva). Ordenados por `sortOrder` asc.
 */
export async function listCustomerVisibleReservationDocuments(): Promise<
  ReservationDocumentRecord[]
> {
  const all = await listAllReservationDocuments();
  return all.filter((d) => d.visibleToCustomer);
}

// ─── helpers internos ─────────────────────────────────────────────────────

function buildS3Key(documentId: string, contentType: string): string {
  const ext = guessExtension(contentType);
  return `reservations/documents/${documentId}${ext}`;
}

function guessExtension(contentType: string): string {
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  return "";
}

function buildDownloadFilename(doc: ReservationDocumentRecord): string {
  const safeTitle = doc.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const base = safeTitle || `documento-${doc.documentId}`;
  return `${base}${guessExtension(doc.contentType)}`;
}

function isConditionalFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: string }).name) : "";
  return name === "ConditionalCheckFailedException";
}
