import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invite-token";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";
import {
  getWorkerInvite,
  isWorkerInviteExpired,
  recordRrhhAccess,
} from "@/lib/repositories/rrhh";
import {
  DocumentValidationError,
  storeWorkerDocument,
} from "@/lib/rrhh/documents";
import type { RrhhDocumentSide } from "@/types/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/rrhh/onboarding/documents`
 *
 * Subida del DNI por el propio trabajador tras completar el alta. Requiere
 * el token de invitación (ya consumido) y resuelve su `userId` desde la
 * invitación. Multipart con `token`, `side` (front|back) y `file`.
 */
export async function POST(req: Request) {
  const ip = extractClientIp(req);
  const ipLimit = await applyRateLimits(
    req,
    [{ key: `rrhh:onboarding-docs:ip:${ip}`, windowMs: 10 * 60 * 1000, max: 20 }],
    { route: "rrhh/onboarding/documents" },
  );
  if (!ipLimit.ok) return ipLimit.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const token = String(form.get("token") ?? "");
  if (token.length < 64) {
    return NextResponse.json({ error: "Token no válido" }, { status: 400 });
  }
  const tokenHash = hashInviteToken(token);

  const tokenLimit = await applyRateLimits(
    req,
    [
      {
        key: `rrhh:onboarding-docs:token:${tokenHash}`,
        windowMs: 10 * 60 * 1000,
        max: 10,
      },
    ],
    { route: "rrhh/onboarding/documents" },
  );
  if (!tokenLimit.ok) return tokenLimit.response;

  const invite = await getWorkerInvite(tokenHash);
  if (!invite || isWorkerInviteExpired(invite) || !invite.consumedUserId) {
    return NextResponse.json(
      { error: "Completa primero tu alta para poder subir documentos." },
      { status: 400 },
    );
  }
  const userId = invite.consumedUserId;

  const sideRaw = form.get("side");
  const side =
    sideRaw === "back" ? "back" : sideRaw === "front" ? "front" : null;
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
      source: "onboarding",
      uploadedByUserId: userId,
    });
    await recordRrhhAccess({
      userId,
      action: "upload_document",
      actorUserId: userId,
      docId: docMeta.docId,
    });
    return NextResponse.json({ ok: true, side: docMeta.side });
  } catch (err) {
    if (err instanceof DocumentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[rrhh/onboarding/documents] upload failed");
    return NextResponse.json(
      { error: "No se pudo subir el documento" },
      { status: 500 },
    );
  }
}
