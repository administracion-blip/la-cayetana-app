import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import { deleteObject, getObjectAsBuffer } from "@/lib/s3";
import { requireRrhhEnv } from "@/lib/env";
import {
  deleteWorkerDocumentRecord,
  getWorkerDocument,
  recordRrhhAccess,
} from "@/lib/repositories/rrhh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/rrhh/workers/:userId/documents/:docId`
 *
 * Proxy privado que entrega el binario del documento. Nunca expone una URL
 * pública de S3. Permiso requerido: `canManageRrhh`. Registra auditoría.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string; docId: string }> },
) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId, docId } = await params;
  const doc = await getWorkerDocument(userId, docId);
  if (!doc) return new Response(null, { status: 404 });

  const { RRHH_DOCS_S3_BUCKET } = requireRrhhEnv();
  const obj = await getObjectAsBuffer({
    bucket: RRHH_DOCS_S3_BUCKET,
    key: doc.s3Key,
  });
  if (!obj) return new Response(null, { status: 404 });

  await recordRrhhAccess({
    userId,
    action: "view_document",
    actorUserId: guard.user.id,
    docId,
  });

  return new Response(new Uint8Array(obj.buffer), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}

/**
 * `DELETE /api/admin/rrhh/workers/:userId/documents/:docId`
 *
 * Borra el binario en S3 y su metadato. Permiso requerido: `canManageRrhh`.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string; docId: string }> },
) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId, docId } = await params;
  const doc = await getWorkerDocument(userId, docId);
  if (!doc) {
    return NextResponse.json(
      { error: "Documento no encontrado" },
      { status: 404 },
    );
  }

  const { RRHH_DOCS_S3_BUCKET } = requireRrhhEnv();
  try {
    await deleteObject({ bucket: RRHH_DOCS_S3_BUCKET, key: doc.s3Key });
  } catch (err) {
    console.error("[api][admin][rrhh][documents][delete-s3]", err);
  }
  await deleteWorkerDocumentRecord(userId, docId);
  await recordRrhhAccess({
    userId,
    action: "delete_document",
    actorUserId: guard.user.id,
    docId,
  });

  return NextResponse.json({ ok: true });
}
