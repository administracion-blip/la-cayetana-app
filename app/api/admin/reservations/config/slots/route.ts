import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationStaffForApi } from "@/lib/auth/reservation-admin";
import {
  getSlotsConfig,
  putSlotsConfig,
  validateSlotWindow,
} from "@/lib/repositories/reservation-config";
import { serializeAdminSlotsConfig } from "@/lib/serialization/reservations";
import { adminSlotsConfigSchema } from "@/lib/validation-reservations";
import type { ReservationConfigSlotsRecord } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/reservations/config/slots`
 * `PUT /api/admin/reservations/config/slots`
 *
 * Lee/actualiza la configuración de slots. Toda edición reemplaza el
 * item entero (`byWeekday`, `exceptions`, min/max party, anticipación…).
 */
export async function GET() {
  const guard = await requireReservationStaffForApi("view");
  if (!guard.ok) return guard.response;
  const config = await getSlotsConfig();
  return NextResponse.json({ config: serializeAdminSlotsConfig(config) });
}

export async function PUT(request: Request) {
  const guard = await requireReservationStaffForApi("edit_config");
  if (!guard.ok) return guard.response;

  let payload: z.infer<typeof adminSlotsConfigSchema>;
  try {
    payload = adminSlotsConfigSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  // Validación extra: ventanas internamente consistentes.
  try {
    for (const day of Object.values(payload.byWeekday)) {
      for (const w of day.windows) validateSlotWindow(w);
    }
    for (const day of Object.values(payload.exceptions ?? {})) {
      for (const w of day.windows) validateSlotWindow(w);
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Alguna ventana horaria es inválida";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (payload.minPartySize > payload.maxPartySize) {
    return NextResponse.json(
      {
        error:
          "El mínimo de comensales no puede ser mayor que el máximo.",
      },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const from = payload.bookableFromDate?.trim() || undefined;
  const until = payload.bookableUntilDate?.trim() || undefined;
  const record: ReservationConfigSlotsRecord = {
    PK: "CONFIG",
    SK: "SLOTS",
    entityType: "RESERVATION_CONFIG",
    timezone: payload.timezone,
    byWeekday: payload.byWeekday as ReservationConfigSlotsRecord["byWeekday"],
    exceptions: (payload.exceptions ??
      {}) as ReservationConfigSlotsRecord["exceptions"],
    advanceMinMinutes: payload.advanceMinMinutes,
    advanceMaxDays: payload.advanceMaxDays,
    minPartySize: payload.minPartySize,
    maxPartySize: payload.maxPartySize,
    updatedAt: nowIso,
    updatedByUserId: guard.user.id,
    ...(from ? { bookableFromDate: from } : {}),
    ...(until ? { bookableUntilDate: until } : {}),
  };

  try {
    await putSlotsConfig(record);
    return NextResponse.json({ config: serializeAdminSlotsConfig(record) });
  } catch (err) {
    console.error("[api][admin][reservations][config][slots][put]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración" },
      { status: 500 },
    );
  }
}
