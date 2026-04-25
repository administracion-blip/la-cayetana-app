import { NextResponse } from "next/server";
import { listCustomerVisibleReservationDocuments } from "@/lib/repositories/reservation-documents";
import { serializeReservationDocument } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/reservations/documents`
 *
 * Listado de documentos visibles al cliente (menús, carta, bebidas,
 * condiciones de prepago…). El staff los gestiona en admin (PR5). Cada
 * documento incluye una URL proxy para descargar el archivo sin exponer
 * S3 directamente.
 */
export async function GET() {
  try {
    const docs = await listCustomerVisibleReservationDocuments();
    return NextResponse.json({
      documents: docs.map(serializeReservationDocument),
    });
  } catch (err) {
    console.error("[api][reservations][documents]", err);
    return NextResponse.json(
      { error: "No se pudieron obtener los documentos" },
      { status: 500 },
    );
  }
}
