import { randomUUID } from "node:crypto";
import { putObject } from "@/lib/s3";
import { requireReservationsEnv } from "@/lib/env";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validatePrepaymentProofFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; message: string } {
  if (file.size <= 0) {
    return { ok: false, message: "El archivo está vacío." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "El archivo supera 10 MB." };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Formato no permitido. Usa PDF, JPG, PNG o WebP.",
    };
  }
  return { ok: true };
}

function extFromNameOrMime(fileName: string, mime: string): string {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName);
  if (m) return `.${m[1].toLowerCase()}`;
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

/** Nombre seguro para cabeceras y Dynamo (truncado). */
export function sanitizeProofDisplayName(name: string): string {
  const base = name.trim().replace(/[/\\]/g, "_") || "justificante";
  return base.slice(0, 200);
}

export async function uploadPrepaymentProof(params: {
  reservationId: string;
  body: Buffer;
  fileName: string;
  contentType: string;
}): Promise<{ s3Key: string; fileName: string }> {
  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  const ext = extFromNameOrMime(params.fileName, params.contentType);
  const key = `prepayment-proofs/${params.reservationId}/${randomUUID()}${ext}`;
  await putObject({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key,
    body: params.body,
    contentType: params.contentType,
    cacheControl: "private, max-age=300",
  });
  return {
    s3Key: key,
    fileName: sanitizeProofDisplayName(params.fileName),
  };
}
