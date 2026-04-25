import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateAccessGatesCache } from "@/lib/access-gates";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  getAccessGatesConfig,
  putAccessGatesConfig,
} from "@/lib/repositories/reservation-config";
import { serializeAdminAccessGatesConfig } from "@/lib/serialization/reservations";
import { adminAccessGatesConfigSchema } from "@/lib/validation-reservations";
import type { ReservationConfigAccessGatesRecord } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/config/access-gates`
 * `PUT /api/admin/reservations/config/access-gates`
 *
 * Cierres temporales: carnet (alta web), reservas de mesa y login
 * público. Los admins conservan bypass en login (gestionado en la propia
 * ruta de autenticación).
 */
export async function GET() {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const config = await getAccessGatesConfig();
  return NextResponse.json({
    config: serializeAdminAccessGatesConfig(config),
  });
}

export async function PUT(request: Request) {
  const guard = await requireReservationStaffForApi("edit_config");
  if (!guard.ok) return guard.response;

  let payload: z.infer<typeof adminAccessGatesConfigSchema>;
  try {
    payload = adminAccessGatesConfigSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  const nowIso = new Date().toISOString();
  const record: ReservationConfigAccessGatesRecord = {
    PK: "CONFIG",
    SK: "CARNET",
    entityType: "RESERVATION_CONFIG",
    updatedAt: nowIso,
    updatedByUserId: guard.user.id,
  };
  if (payload.carnetPurchaseDeadlineIso) {
    record.carnetPurchaseDeadlineIso = payload.carnetPurchaseDeadlineIso;
  }
  if (payload.tableReservationDeadlineIso) {
    record.tableReservationDeadlineIso = payload.tableReservationDeadlineIso;
  }
  if (payload.loginDeadlineIso) {
    record.loginDeadlineIso = payload.loginDeadlineIso;
  }

  try {
    await putAccessGatesConfig(record);
    invalidateAccessGatesCache();
    return NextResponse.json({
      config: serializeAdminAccessGatesConfig(record),
    });
  } catch (err) {
    console.error("[api][admin][reservations][config][access-gates][put]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración" },
      { status: 500 },
    );
  }
}
