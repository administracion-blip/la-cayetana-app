import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { requireReservationsEnv } from "@/lib/env";
import {
  getMenusConfig,
  putMenusConfig,
} from "@/lib/repositories/reservation-config";
import { deleteObject, putObject } from "@/lib/s3";
import { sniffUploadOrWarn } from "@/lib/upload/sniff";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const dynamic = "force-dynamic";

/**
 * Sube o sustituye la imagen de un menú. El `offerId` debe existir ya
 * en el catálogo (tras guardar la fila en `PUT /config/menus`).
 */
export async function POST(request: Request) {
  const guard = await requireReservationStaffForApi("edit_config");
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data" },
      { status: 400 },
    );
  }
  const offerIdRaw = form.get("offerId");
  const file = form.get("file");
  if (typeof offerIdRaw !== "string" || !offerIdRaw.trim()) {
    return NextResponse.json(
      { error: "Falta offerId" },
      { status: 400 },
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Falta archivo" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Imagen demasiado grande (máx. 5 MB)" },
      { status: 400 },
    );
  }
  const contentType = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { error: "Formato no permitido (usa JPG, PNG, WebP o GIF)" },
      { status: 400 },
    );
  }

  const offerId = offerIdRaw.trim();
  const config = await getMenusConfig();
  const idx = config.offers.findIndex((o) => o.offerId === offerId);
  if (idx < 0) {
    return NextResponse.json(
      { error: "Ese menú no existe. Guarda primero el catálogo." },
      { status: 404 },
    );
  }
  const prevKey = config.offers[idx]!.imageS3Key;
  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  const s3Key = `menu-offers/${offerId}/image`;
  const buf = Buffer.from(await file.arrayBuffer());

  // Warn-only: cabecera real vs MIME declarado. Hoy solo loggea.
  sniffUploadOrWarn(buf, contentType, {
    endpoint: "admin/reservations/config/menus/image",
    adminUserId: guard.user.id,
    fileName: file.name,
  });

  await putObject({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key: s3Key,
    body: buf,
    contentType,
    cacheControl: "private, max-age=300",
  });

  if (prevKey && prevKey !== s3Key) {
    try {
      await deleteObject({ bucket: RESERVATION_DOCS_S3_BUCKET, key: prevKey });
    } catch {
      /* best-effort */
    }
  }

  const now = new Date().toISOString();
  const next = { ...config };
  next.offers = [...config.offers];
  next.offers[idx] = {
    ...next.offers[idx]!,
    imageS3Key: s3Key,
    imageContentType: contentType,
  };
  next.updatedAt = now;
  next.updatedByUserId = guard.user.id;
  await putMenusConfig(next);

  return NextResponse.json({
    ok: true,
    imageS3Key: s3Key,
    imageContentType: contentType,
  });
}
