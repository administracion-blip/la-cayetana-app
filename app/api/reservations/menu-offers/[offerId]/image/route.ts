import { NextResponse } from "next/server";
import { getMenusConfig } from "@/lib/repositories/reservation-config";
import { getObjectAsBuffer } from "@/lib/s3";
import { requireReservationsEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Imagen pública de un menú (solo ofertas activas con imagen en S3).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params;
  try {
    const menus = await getMenusConfig();
    const o = menus.offers.find((x) => x.offerId === offerId);
    if (!o?.active || !o.imageS3Key) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const { RESERVATION_DOCS_S3_BUCKET } = requireReservationsEnv();
    const got = await getObjectAsBuffer({
      bucket: RESERVATION_DOCS_S3_BUCKET,
      key: o.imageS3Key,
    });
    if (!got) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(got.buffer), {
      status: 200,
      headers: {
        "Content-Type": o.imageContentType || got.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[api][menu-offer][image][GET]", err);
    return NextResponse.json(
      { error: "No se pudo cargar la imagen" },
      { status: 500 },
    );
  }
}
