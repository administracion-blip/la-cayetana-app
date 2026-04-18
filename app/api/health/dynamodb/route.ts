import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Comprueba región, credenciales y acceso a la tabla `users` (scan de 1 ítem).
 * Solo disponible en desarrollo.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { USERS_TABLE_NAME, AWS_REGION } = getEnv();
    const doc = getDocClient();
    await doc.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        Limit: 1,
      }),
    );
    return NextResponse.json({
      ok: true,
      region: AWS_REGION,
      table: USERS_TABLE_NAME,
      message: "DynamoDB responde correctamente.",
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        errorName: err.name ?? "Error",
        message: err.message ?? String(e),
      },
      { status: 500 },
    );
  }
}
