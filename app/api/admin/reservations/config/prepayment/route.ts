import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  getPrepaymentConfig,
  putPrepaymentConfig,
} from "@/lib/repositories/reservation-config";
import { serializeAdminPrepaymentConfig } from "@/lib/serialization/reservations";
import { adminPrepaymentConfigSchema } from "@/lib/validation-reservations";
import type { ReservationConfigPrepaymentRecord } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/config/prepayment`
 * `PUT /api/admin/reservations/config/prepayment`
 */
export async function GET() {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const config = await getPrepaymentConfig();
  return NextResponse.json({ config: serializeAdminPrepaymentConfig(config) });
}

export async function PUT(request: Request) {
  const guard = await requireReservationStaffForApi("edit_config");
  if (!guard.ok) return guard.response;

  let payload: z.infer<typeof adminPrepaymentConfigSchema>;
  try {
    payload = adminPrepaymentConfigSchema.parse(await request.json());
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
  const record: ReservationConfigPrepaymentRecord = {
    PK: "CONFIG",
    SK: "PREPAYMENT",
    entityType: "RESERVATION_CONFIG",
    enabled: payload.enabled,
    minPartySize: payload.minPartySize,
    amountPerPersonCents: payload.amountPerPersonCents,
    deadlineHours: payload.deadlineHours,
    instructionsTemplate: payload.instructionsTemplate,
    updatedAt: nowIso,
    updatedByUserId: guard.user.id,
  };

  try {
    await putPrepaymentConfig(record);
    return NextResponse.json({
      config: serializeAdminPrepaymentConfig(record),
    });
  } catch (err) {
    console.error("[api][admin][reservations][config][prepayment][put]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración" },
      { status: 500 },
    );
  }
}
