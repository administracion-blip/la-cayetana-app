import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { getDocClient } from "@/lib/dynamo";
import { requireReservationsEnv } from "@/lib/env";
import { deleteObject } from "@/lib/s3";
import {
  uploadPrepaymentProof,
  validatePrepaymentProofFile,
} from "@/lib/prepayment-proof-upload";
import { sniffUploadOrWarn } from "@/lib/upload/sniff";
import {
  ReservationConflictError,
  ReservationNotFoundError,
  getReservationById,
  updateReservationStatus,
} from "@/lib/repositories/reservations";
import { serializeAdminReservation } from "@/lib/serialization/reservations";
import { adminReservationPrepaymentSchema } from "@/lib/validation-reservations";
import type { PrepaymentProofItem } from "@/types/models";

export const dynamic = "force-dynamic";

const expectedVersionForm = z.coerce.number().int().nonnegative();

const MAX_PROOF_FILES = 15;

/**
 * `POST /api/admin/reservations/:id/prepayment`
 *
 *  - `mark_received` (multipart): al menos un archivo + `amountCents` (JSON
 *     array de céntimos, mismo orden que `file` repetido) → varios
 *     justificantes, total en `prepaymentProofItems`.
 *  - `mark_refunded` (JSON): señal devuelta.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("manage");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Formulario de archivo inválido" },
        { status: 400 },
      );
    }
    const action = form.get("action");
    const ev = form.get("expectedVersion");
    if (action !== "mark_received") {
      return NextResponse.json(
        {
          error:
            "Para devolver señal usa JSON (acción mark_refunded), no multipart",
        },
        { status: 400 },
      );
    }
    const parsedV = expectedVersionForm.safeParse(
      typeof ev === "string" || typeof ev === "number" ? ev : "",
    );
    if (!parsedV.success) {
      return NextResponse.json(
        { error: "expectedVersion no válido" },
        { status: 400 },
      );
    }
    const expectedVersion = parsedV.data;

    const fileFields = form.getAll("file");
    const files = fileFields.filter(
      (f): f is File => typeof File !== "undefined" && f instanceof File,
    );
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Debes adjuntar al menos un justificante (PDF o imagen)." },
        { status: 400 },
      );
    }
    if (files.length > MAX_PROOF_FILES) {
      return NextResponse.json(
        {
          error: `Como máximo ${MAX_PROOF_FILES} justificantes por envío.`,
        },
        { status: 400 },
      );
    }

    const amountsJson = form.get("amountCents");
    if (typeof amountsJson !== "string" || !amountsJson.trim()) {
      return NextResponse.json(
        { error: "Falta el importe (amountCents) de cada justificante." },
        { status: 400 },
      );
    }
    let rawAmounts: unknown;
    try {
      rawAmounts = JSON.parse(amountsJson) as unknown;
    } catch {
      return NextResponse.json(
        { error: "Importes inválidos (JSON incorrecto)" },
        { status: 400 },
      );
    }
    if (!Array.isArray(rawAmounts) || rawAmounts.length !== files.length) {
      return NextResponse.json(
        {
          error:
            "Cada justificante necesita un importe en céntimos (mismo número que archivos).",
        },
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
        { error: "Cada importe debe ser un entero (céntimos) ≥ 1." },
        { status: 400 },
      );
    }
    for (const c of amountCentsList) {
      if (c < 1 || c > 1_000_000_000) {
        return NextResponse.json(
          { error: "Importe fuera de rango (céntimos)." },
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

    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 },
      );
    }
    if (reservation.version !== expectedVersion) {
      return NextResponse.json(
        {
          error:
            "La reserva cambió mientras la editabas. Recarga y vuelve a intentarlo.",
          code: "conflict",
        },
        { status: 409 },
      );
    }

    const uploadedKeys: string[] = [];
    const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
    const nowIso = new Date().toISOString();
    const prepaymentProofItems: PrepaymentProofItem[] = [];

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        const buffer = Buffer.from(await file.arrayBuffer());
        sniffUploadOrWarn(buffer, file.type || "application/octet-stream", {
          endpoint: "admin/reservations/[id]/prepayment",
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
        prepaymentProofItems.push({
          proofId: randomUUID(),
          s3Key: uploaded.s3Key,
          fileName: uploaded.fileName,
          amountCents: amountCentsList[i]!,
          uploadedAt: nowIso,
        });
      }

      const updated = await updateReservationStatus({
        reservationId: id,
        newStatus: "confirmed",
        expectedVersion,
        updatedBy: `staff:${guard.user.id}`,
        markPrepaymentReceived: true,
        prepaymentProofItems,
        systemMessage: "Hemos recibido tu señal. ¡Reserva confirmada!",
      });
      return NextResponse.json({
        reservation: serializeAdminReservation(updated),
      });
    } catch (err) {
      for (const key of uploadedKeys) {
        try {
          await deleteObject({ bucket: RESERVATION_DOCS_S3_BUCKET, key });
        } catch (delErr) {
          console.warn("[prepayment] rollback S3 falló", delErr);
        }
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
              "La reserva cambió mientras la editabas. Recarga y vuelve a intentarlo.",
            code: "conflict",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  // ─── JSON: solo mark_refunded (mark_received requiere multipart) ───
  let payload: z.infer<typeof adminReservationPrepaymentSchema>;
  try {
    payload = adminReservationPrepaymentSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  // mark_refunded
  const reservation = await getReservationById(id);
  if (!reservation) {
    return NextResponse.json(
      { error: "Reserva no encontrada" },
      { status: 404 },
    );
  }
  if (reservation.version !== payload.expectedVersion) {
    return NextResponse.json(
      {
        error:
          "La reserva cambió mientras la editabas. Recarga y vuelve a intentarlo.",
        code: "conflict",
      },
      { status: 409 },
    );
  }
  const doc = getDocClient();
  const { RESERVATIONS_TABLE_NAME } = requireReservationsEnv();
  const nowIso = new Date().toISOString();
  try {
    await doc.send(
      new UpdateCommand({
        TableName: RESERVATIONS_TABLE_NAME,
        Key: { PK: reservation.PK, SK: reservation.SK },
        UpdateExpression:
          "SET prepaymentStatus = :ps, updatedAt = :u, updatedBy = :ub, version = :next",
        ConditionExpression: "version = :expected",
        ExpressionAttributeValues: {
          ":ps": "refunded",
          ":u": nowIso,
          ":ub": `staff:${guard.user.id}`,
          ":next": reservation.version + 1,
          ":expected": reservation.version,
        },
      }),
    );
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        {
          error:
            "La reserva cambió mientras la editabas. Recarga e inténtalo de nuevo.",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    throw err;
  }
  const refreshed = await getReservationById(id);
  if (!refreshed) {
    return NextResponse.json(
      { error: "Reserva no encontrada" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    reservation: serializeAdminReservation(refreshed),
  });
}
