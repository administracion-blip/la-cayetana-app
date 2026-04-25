import { NextResponse } from "next/server";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  getMenusConfig,
  putMenusConfig,
} from "@/lib/repositories/reservation-config";
import { normalizeMainCourseSlots } from "@/lib/reservation-menus-helpers";
import { serializeAdminMenusConfig } from "@/lib/serialization/reservations";
import { adminMenusConfigSchema } from "@/lib/validation-reservations";
import type { ReservationConfigMenusRecord } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * `GET/PUT` catálogo de menús (config `CONFIG` / `MENUS`).
 */
export async function GET() {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  try {
    const c = await getMenusConfig();
    return NextResponse.json({ config: serializeAdminMenusConfig(c) });
  } catch (err) {
    console.error("[api][admin][menus][GET]", err);
    return NextResponse.json(
      { error: "No se pudo cargar el catálogo de menús" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const guard = await requireReservationStaffForApi("edit_config");
  if (!guard.ok) return guard.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 },
    );
  }
  const parsed = adminMenusConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const now = new Date().toISOString();
  const record: ReservationConfigMenusRecord = {
    PK: "CONFIG",
    SK: "MENUS",
    entityType: "RESERVATION_CONFIG",
    offers: parsed.data.offers.map((o) => ({
      offerId: o.offerId,
      name: o.name,
      priceCents: o.priceCents,
      mainCourses: [...normalizeMainCourseSlots(o.mainCourses)],
      active: o.active,
      sortOrder: o.sortOrder,
      imageS3Key: o.imageS3Key,
      imageContentType: o.imageContentType,
    })),
    updatedAt: now,
    updatedByUserId: guard.user.id,
  };
  try {
    await putMenusConfig(record);
    const c = await getMenusConfig();
    return NextResponse.json({ config: serializeAdminMenusConfig(c) });
  } catch (err) {
    console.error("[api][admin][menus][PUT]", err);
    return NextResponse.json(
      { error: "No se pudo guardar el catálogo" },
      { status: 500 },
    );
  }
}
