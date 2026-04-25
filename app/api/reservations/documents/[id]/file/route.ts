import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  getReservationDocument,
  getReservationDocumentFile,
} from "@/lib/repositories/reservation-documents";

export const dynamic = "force-dynamic";

/**
 * `GET /api/reservations/documents/:id/file`
 *
 * Proxy binario para descargar el PDF (o imagen) asociado al documento.
 * Mantiene el bucket S3 privado. Envía cabeceras correctas para que el
 * navegador muestre el PDF inline en lugar de forzar descarga.
 *
 * Autorización por flag del documento:
 *  - `visibleToCustomer === true`  → acceso público (carta, menús,
 *    condiciones de prepago…). El listado `GET /api/reservations/documents`
 *    sólo expone estos `documentId`.
 *  - `visibleToCustomer === false` → exige sesión staff con permiso `view`.
 *    Antes era accesible a cualquiera con un id válido; el listado nunca
 *    los expuso, así que esto no rompe ningún flujo legítimo.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    // Hacemos un primer fetch de metadatos para decidir autorización antes
    // de tirar S3. Es 1 GetItem de Dynamo (despreciable) y mantiene el
    // handler legible: la lógica del binario sigue en el repo.
    const meta = await getReservationDocument(id);
    if (!meta) {
      return NextResponse.json(
        { error: "Documento no encontrado" },
        { status: 404 },
      );
    }

    if (!meta.visibleToCustomer) {
      const guard = await requireReservationStaffForApi("view");
      if (!guard.ok) return guard.response;
    }

    const file = await getReservationDocumentFile(id);
    if (!file) {
      return NextResponse.json(
        { error: "Documento no encontrado" },
        { status: 404 },
      );
    }
    // Saneamos el filename para evitar header-injection (CR/LF) y comillas
    // que rompan la cabecera. `filename*` lleva la versión UTF-8 completa
    // según RFC 5987 para que clientes modernos sigan mostrando tildes.
    const safeAsciiName = (file.filename || "documento").replace(
      /["\r\n]/g,
      "_",
    );
    // Documentos privados: nunca cachear (ni siquiera en el navegador del
    // staff) para evitar que un proxy intermedio reutilice la respuesta.
    const cacheControl = meta.visibleToCustomer
      ? "private, max-age=300"
      : "private, no-store";
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.buffer.byteLength),
        "Content-Disposition": `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(
          file.filename || "documento",
        )}`,
        "Cache-Control": cacheControl,
      },
    });
  } catch (err) {
    console.error("[api][reservations][documents][file]", err);
    return NextResponse.json(
      { error: "No se pudo descargar el documento" },
      { status: 500 },
    );
  }
}
