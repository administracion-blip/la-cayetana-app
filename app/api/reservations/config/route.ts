import { NextResponse } from "next/server";
import {
  getMenusConfig,
  getPrepaymentConfig,
  getSlotsConfig,
} from "@/lib/repositories/reservation-config";
import { serializeReservationConfig } from "@/lib/serialization/reservations";

export const dynamic = "force-dynamic";

/**
 * Devuelve la configuración pública del módulo de reservas: anticipación,
 * límites de tamaño y parámetros generales de prepago. No devuelve los
 * slots concretos (eso se pide por día a `/api/reservations/slots`).
 */
export async function GET() {
  try {
    const [slots, prepayment, menus] = await Promise.all([
      getSlotsConfig(),
      getPrepaymentConfig(),
      getMenusConfig(),
    ]);
    return NextResponse.json(
      serializeReservationConfig(slots, prepayment, menus),
    );
  } catch (err) {
    console.error("[api][reservations][config]", err);
    return NextResponse.json(
      { error: "No se pudo obtener la configuración de reservas" },
      { status: 500 },
    );
  }
}
