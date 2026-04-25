import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireProgramacionAdminForApi } from "@/lib/auth/admin";
import { getEnv } from "@/lib/env";
import { putObject } from "@/lib/s3";
import { sniffUploadOrWarn } from "@/lib/upload/sniff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Sube una imagen al bucket S3 del proyecto (`PROGRAMACION_S3_BUCKET`) bajo
 * la ruta `programacion/<uuid>.<ext>` y devuelve la clave y el content-type.
 *
 * El bucket puede ser privado: la app sirve las imágenes a través de
 * `/api/programacion/image?key=...`.
 */
export async function POST(req: Request) {
  const auth = await requireProgramacionAdminForApi();
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Formato inválido (multipart/form-data esperado)" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Falta el archivo (campo 'file')" },
      { status: 400 },
    );
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Formato no admitido (JPG, PNG, WEBP o GIF)" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera los 5 MB" },
      { status: 413 },
    );
  }

  const ext = EXTENSION[contentType] ?? "bin";
  const key = `programacion/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Warn-only: cabecera real vs MIME declarado. Hoy solo loggea.
  sniffUploadOrWarn(buffer, contentType, {
    endpoint: "admin/programacion/upload",
    adminUserId: auth.user.id,
    fileName: typeof file.name === "string" ? file.name : undefined,
  });

  const { PROGRAMACION_S3_BUCKET } = getEnv();
  try {
    await putObject({
      bucket: PROGRAMACION_S3_BUCKET,
      key,
      body: buffer,
      contentType,
    });
  } catch (err) {
    console.error("[admin/programacion/upload]", err);
    return NextResponse.json(
      { error: "No se pudo subir la imagen" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, key, contentType, size: buffer.length });
}
