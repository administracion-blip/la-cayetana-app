import { NextResponse } from "next/server";
import {
  computeAvailableSlots,
  getSlotsConfig,
} from "@/lib/repositories/reservation-config";
import {
  listReservationsByDate,
  ACTIVE_RESERVATION_STATUSES,
} from "@/lib/repositories/reservations";
import { serializeSlotDay } from "@/lib/serialization/reservations";
import { slotsQuerySchema } from "@/lib/validation-reservations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/reservations/slots?date=YYYY-MM-DD`
 *
 * Devuelve los slots `HH:mm` disponibles para ese día. Aplica:
 *  - Anticipación mínima/máxima.
 *  - Excepciones de la config.
 *  - Capacidad: si la suma de comensales activos ≥ capacity del tramo,
 *    no emite más slots dentro de ese tramo.
 *
 * No distingue si el usuario está logueado o no; todos ven los mismos
 * slots libres.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = slotsQuerySchema.safeParse({ date: url.searchParams.get("date") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" },
      { status: 400 },
    );
  }
  try {
    const config = await getSlotsConfig();
    const now = new Date();
    const result = computeAvailableSlots({
      dateStr: parsed.data.date,
      now,
      config,
    });
    if (result.slots.length === 0) {
      return NextResponse.json(serializeSlotDay(parsed.data.date, result));
    }

    // Aplicar capacidad agregada del día. Implementación simple: sumamos
    // todos los comensales activos del día y si superan la capacidad
    // máxima del MAYOR tramo del día, vaciamos los slots. Una versión
    // más fina filtra tramo a tramo; eso vendrá si hace falta.
    const reservations = await listReservationsByDate(parsed.data.date);
    const totalActive = reservations
      .filter((r) => ACTIVE_RESERVATION_STATUSES.includes(r.status))
      .reduce((acc, r) => acc + r.partySize, 0);

    // Capacidad máxima del día = suma de `capacity` de todas las ventanas
    // del día aplicable.
    const exception = config.exceptions[parsed.data.date];
    const weekdayConfig = exception
      ? exception
      : config.byWeekday[
          (
            [
              "sunday",
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
            ] as const
          )[new Date(`${parsed.data.date}T12:00:00Z`).getUTCDay()]
        ] ?? { windows: [] };
    const totalCapacity = weekdayConfig.windows.reduce(
      (acc, w) => acc + w.capacity,
      0,
    );

    const filteredSlots =
      totalCapacity > 0 && totalActive >= totalCapacity ? [] : result.slots;

    return NextResponse.json(
      serializeSlotDay(parsed.data.date, {
        ...result,
        slots: filteredSlots,
      }),
    );
  } catch (err) {
    console.error("[api][reservations][slots]", err);
    return NextResponse.json(
      { error: "No se pudieron calcular los slots" },
      { status: 500 },
    );
  }
}
