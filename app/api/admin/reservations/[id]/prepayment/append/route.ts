import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { requireReservationsEnv } from "@/lib/env";
import { deleteObject } from "@/lib/s3";
import {
  uploadPrepaymentProof,
  validatePrepaymentProofFile,
} from "@/lib/prepayment-proof-upload";
import { sniffUploadOrWarn } from "@/lib/upload/sniff";
import {
  appendPrepaymentProofs,
  ReservationConflictError,
  ReservationNotFoundError,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
import type { PrepaymentProofItem } from "@/types/models";

export const dynamic = "force-dynamic";

const MAX_PROOF_FILES = 15;

/**
 * `POST /api/admin/reservations/:id/prepayment/append` (multipart)
 * Añade comprobantes con importe; la señal debe estar ya en `received`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Formulario de archivo inválido" },
      { status: 400 },
    );
  }

  const ev = form.get("expectedVersion");
  const expected =
    typeof ev === "string" || typeof ev === "number" ? Number(ev) : NaN;
  if (!Number.isInteger(expected) || expected < 0) {
    return NextResponse.json(
      { error: "expectedVersion no válido" },
      { status: 400 },
    );
  }

  const fileFields = form.getAll("file");
  const files = fileFields.filter(
    (f): f is File => typeof File !== "undefined" && f instanceof File,
  );
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Añade al menos un comprobante." },
      { status: 400 },
    );
  }
  if (files.length > MAX_PROOF_FILES) {
    return NextResponse.json(
      { error: `Como máximo ${MAX_PROOF_FILES} justificantes por envío.` },
      { status: 400 },
    );
  }

  const amountsJson = form.get("amountCents");
  if (typeof amountsJson !== "string" || !amountsJson.trim()) {
    return NextResponse.json(
      { error: "Falta amountCents (array JSON de céntimos)" },
      { status: 400 },
    );
  }
  let rawAmounts: unknown;
  try {
    rawAmounts = JSON.parse(amountsJson) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Importes inválidos (JSON)" },
      { status: 400 },
    );
  }
  if (!Array.isArray(rawAmounts) || rawAmounts.length !== files.length) {
    return NextResponse.json(
      { error: "Un importe (céntimos) por cada archivo" },
      { status: 400 },
    );
  }
  const amountCentsList: number[] = [];
  for (const a of rawAmounts) {
    if (typeof a === "string" && /^\d+$/.test(a)) {
      amountCentsList.push(Number(a));
      continue;
    }
    if (typeof a === "number" && Number.isInteger(a)) {
      amountCentsList.push(a);
      continue;
    }
    return NextResponse.json(
      { error: "Cada importe ha de ser céntimos enteros (≥1)" },
      { status: 400 },
    );
  }
  for (const c of amountCentsList) {
    if (c < 1 || c > 1_000_000_000) {
      return NextResponse.json(
        { error: "Importe fuera de rango" },
        { status: 400 },
      );
    }
  }
  for (const file of files) {
    const check = validatePrepaymentProofFile(file);
    if (!check.ok) {
      return NextResponse.json({ error: check.message }, { status: 400 });
    }
  }

  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  const uploadedKeys: string[] = [];
  const nowIso = new Date().toISOString();
  const newItems: PrepaymentProofItem[] = [];

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      const buffer = Buffer.from(await file.arrayBuffer());
      sniffUploadOrWarn(buffer, file.type || "application/octet-stream", {
        endpoint: "admin/reservations/[id]/prepayment/append",
        adminUserId: guard.user.id,
        fileName: file.name,
      });
      const uploaded = await uploadPrepaymentProof({
        reservationId: id,
        body: buffer,
        fileName: file.name,
        contentType: file.type,
      });
      uploadedKeys.push(uploaded.s3Key);
      newItems.push({
        proofId: randomUUID(),
        s3Key: uploaded.s3Key,
        fileName: uploaded.fileName,
        amountCents: amountCentsList[i]!,
        uploadedAt: nowIso,
      });
    }
    const updated = await appendPrepaymentProofs({
      reservationId: id,
      expectedVersion: expected,
      newItems,
      updatedBy: `staff:${guard.user.id}`,
    });
    return NextResponse.json({
      reservation: serializeAdminReservation(updated),
    });
  } catch (err) {
    for (const key of uploadedKeys) {
      try {
        await deleteObject({ bucket: RESERVATION_DOCS_S3_BUCKET, key });
      } catch (delErr) {
        console.warn("[prepayment/append] rollback S3", delErr);
      }
    }
    if (err instanceof Error && err.message.includes("Solo se pueden añadir")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    if (err instanceof ReservationConflictError) {
      return NextResponse.json(
        {
          error:
            "La reserva cambió. Recarga e inténtalo de nuevo",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
