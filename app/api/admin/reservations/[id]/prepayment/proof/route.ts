import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import { getObjectAsBuffer } from "@/lib/s3";
import { requireReservationsEnv } from "@/lib/env";
import { getReservationById } from "@/lib/repositories/reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/:id/prepayment/proof?proofId=...`
 *
 * Descarga un justificante de señal. Con varios, `proofId` identifica
 * al ítem; se omite o `legacy` con el registro de un solo archivo antiguo.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const proofId = new URL(request.url).searchParams.get("proofId");

  const r = await getReservationById(id);
  if (!r) {
    return NextResponse.json(
      { error: "Reserva no encontrada" },
      { status: 404 },
    );
  }

  let s3Key: string | undefined;
  let fileName: string = "justificante";

  if (r.prepaymentProofItems && r.prepaymentProofItems.length > 0) {
    if (r.prepaymentProofItems.length > 1) {
      if (!proofId || proofId.length === 0) {
        return NextResponse.json(
          {
            error: "Especifica ?proofId= (identificador del justificante).",
          },
          { status: 400 },
        );
      }
    }
    const want = proofId ?? r.prepaymentProofItems[0]!.proofId;
    const item = r.prepaymentProofItems.find((p) => p.proofId === want);
    if (!item) {
      return NextResponse.json(
        { error: "No existe ese justificante en la reserva." },
        { status: 404 },
      );
    }
    s3Key = item.s3Key;
    fileName = item.fileName;
  } else if (r.prepaymentProofS3Key) {
    if (proofId && proofId !== "legacy") {
      return NextResponse.json(
        { error: "Esta reserva solo tiene un justificante (sin proofId o legacy)." },
        { status: 400 },
      );
    }
    s3Key = r.prepaymentProofS3Key;
    fileName = r.prepaymentProofFileName ?? "justificante";
  } else {
    return NextResponse.json(
      { error: "No hay justificante de señal" },
      { status: 404 },
    );
  }

  const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
  const got = await getObjectAsBuffer({
    bucket: RESERVATION_DOCS_S3_BUCKET,
    key: s3Key!,
  });
  if (!got) {
    return NextResponse.json(
      { error: "No se pudo leer el archivo" },
      { status: 500 },
    );
  }
  const { buffer, contentType } = got;

  // Auditoría: registra qué staff vio qué justificante. Útil para
  // investigar accesos en el futuro. No incluye PII del cliente: sólo
  // ids opacos. El email/nombre del cliente queda fuera del log.
  console.info(
    `[audit][prepayment-proof] staff=${guard.user.id} reservationId=${id} proofId=${proofId ?? "<single>"}`,
  );

  const name = (fileName || "justificante").replace(/["\r\n]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(
        fileName || "justificante",
      )}`,
      // Justificantes financieros: nunca cachear ni en navegador ni en
      // proxies intermedios para evitar reutilización entre sesiones.
      "Cache-Control": "private, no-store",
    },
  });
}
