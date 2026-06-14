import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import {
  DocumentValidationError,
  storeWorkerDocument,
} from "@/lib/rrhh/documents";
import { getWorkerProfile, recordRrhhAccess } from "@/lib/repositories/rrhh";
import type { RrhhDocumentSide } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/rrhh/workers/:userId/documents`
 *
 * Sube un documento (DNI) del trabajador desde el panel de RRHH. Multipart
 * con `file` y `side` (front|back). Permiso requerido: `canManageRrhh`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId } = await params;
  const profile = await getWorkerProfile(userId);
  if (!profile) {
    return NextResponse.json(
      { error: "Trabajador no encontrado" },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const sideRaw = form.get("side");
  const side = sideRaw === "back" ? "back" : sideRaw === "front" ? "front" : null;
  if (!side) {
    return NextResponse.json(
      { error: "Indica la cara del documento (front/back)" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Adjunta un archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const originalName =
    "name" in file && typeof (file as File).name === "string"
      ? (file as File).name
      : undefined;

  try {
    const docMeta = await storeWorkerDocument({
      userId,
      side: side as RrhhDocumentSide,
      buffer,
      contentType,
      originalName,
      source: "staff",
      uploadedByUserId: guard.user.id,
    });
    await recordRrhhAccess({
      userId,
      action: "upload_document",
      actorUserId: guard.user.id,
      docId: docMeta.docId,
    });
    return NextResponse.json({
      ok: true,
      document: {
        docId: docMeta.docId,
        side: docMeta.side,
        contentType: docMeta.contentType,
        size: docMeta.size,
        uploadedAt: docMeta.uploadedAt,
      },
    });
  } catch (err) {
    if (err instanceof DocumentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[api][admin][rrhh][documents][upload]", err);
    return NextResponse.json(
      { error: "No se pudo subir el documento" },
      { status: 500 },
    );
  }
}
