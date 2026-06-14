/**
 * Servicio de documentos de RRHH. Centraliza validación, subida al bucket
 * privado y registro de metadatos, para que tanto el alta del trabajador
 * como el panel de RRHH usen la misma lógica y los mismos límites.
 *
 * El binario nunca se sirve por URL pública: se almacena en
 * `RRHH_DOCS_S3_BUCKET` y se entrega por proxy con permiso de gestión.
 */

import { randomUUID } from "node:crypto";
import { requireRrhhEnv } from "@/lib/env";
import { putObject } from "@/lib/s3";
import {
  createWorkerDocument,
  type CreateWorkerDocumentInput,
} from "@/lib/repositories/rrhh";
import type {
  RrhhDocumentSide,
  RrhhWorkerDocumentRecord,
} from "@/types/models";

/** Tamaño máximo por documento (8 MB). Suficiente para una foto de DNI. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** Tipos MIME aceptados para el DNI escaneado. */
export const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isAllowedDocumentType(contentType: string): boolean {
  return (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(contentType);
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

export type StoreWorkerDocumentInput = {
  userId: string;
  side: RrhhDocumentSide;
  buffer: Buffer;
  contentType: string;
  originalName?: string;
  source: CreateWorkerDocumentInput["source"];
  uploadedByUserId: string;
};

/**
 * Valida, sube a S3 (bucket privado) y registra los metadatos del documento.
 * Lanza {@link DocumentValidationError} ante tipo o tamaño no permitidos.
 */
export async function storeWorkerDocument(
  input: StoreWorkerDocumentInput,
): Promise<RrhhWorkerDocumentRecord> {
  if (!isAllowedDocumentType(input.contentType)) {
    throw new DocumentValidationError(
      "Formato no admitido. Sube una imagen (JPG/PNG/WEBP) o un PDF.",
    );
  }
  if (input.buffer.byteLength === 0) {
    throw new DocumentValidationError("El archivo está vacío.");
  }
  if (input.buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError(
      "El archivo supera el tamaño máximo (8 MB).",
    );
  }

  const { RRHH_DOCS_S3_BUCKET } = requireRrhhEnv();
  const docId = randomUUID();
  const ext = EXT_BY_TYPE[input.contentType] ?? "bin";
  const key = `workers/${input.userId}/dni/${input.side}-${docId}.${ext}`;

  await putObject({
    bucket: RRHH_DOCS_S3_BUCKET,
    key,
    body: input.buffer,
    contentType: input.contentType,
    cacheControl: "private, no-store",
  });

  return createWorkerDocument({
    docId,
    userId: input.userId,
    kind: "dni",
    side: input.side,
    s3Key: key,
    contentType: input.contentType,
    size: input.buffer.byteLength,
    originalName: input.originalName,
    source: input.source,
    uploadedByUserId: input.uploadedByUserId,
  });
}
