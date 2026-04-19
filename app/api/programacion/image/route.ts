import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getObjectAsBuffer } from "@/lib/s3";

export const runtime = "nodejs";

/**
 * Proxy público que sirve una imagen del bucket `PROGRAMACION_S3_BUCKET`. El
 * parámetro `key` debe empezar por `programacion/` para evitar acceso a
 * cualquier otro objeto del bucket.
 *
 * Uso en clientes: `<img src="/api/programacion/image?key=programacion/xxx.jpg" />`.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !/^programacion\/[A-Za-z0-9._-]+$/i.test(key)) {
    return new NextResponse(null, { status: 400 });
  }
  const { PROGRAMACION_S3_BUCKET } = getEnv();
  try {
    const obj = await getObjectAsBuffer({
      bucket: PROGRAMACION_S3_BUCKET,
      key,
    });
    if (!obj) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(new Uint8Array(obj.buffer), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("[programacion/image]", err);
    return new NextResponse(null, { status: 502 });
  }
}
