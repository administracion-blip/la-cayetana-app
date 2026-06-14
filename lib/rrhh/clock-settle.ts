/**
 * Cierre automático de fichajes vencidos. Si un trabajador no ficha su salida,
 * al llegar la hora límite de su jornada el sistema cierra el turno marcándolo
 * como `autoClosed` (salida no gestionada).
 *
 * Se aplica de forma perezosa (al leer): no requiere un proceso programado.
 * Cualquier lectura relevante (estado del trabajador, comparativa) liquida los
 * turnos abiertos cuya jornada ya terminó.
 */

import { addDays, zonedWallTimeToUtc } from "@/lib/datetime";
import { closeClockOut } from "@/lib/repositories/rrhh";
import type { RrhhClockRecord } from "@/types/models";

/** Instante UTC en el que termina una jornada (día siguiente a la hora de corte). */
export function jornadaEndUtc(
  jornadaDate: string,
  cutoffHour: number,
  timezone: string,
): Date {
  const [y, m, d] = addDays(jornadaDate, 1).split("-").map(Number);
  return zonedWallTimeToUtc(y, m, d, cutoffHour, 0, 0, 0, timezone);
}

/**
 * Si el fichaje está abierto y su jornada ya terminó, lo cierra a la hora
 * límite y lo marca como `autoClosed`. Devuelve el registro efectivo (cerrado
 * si procede). La persistencia es best-effort: si falla, devuelve el cierre
 * virtual igualmente para que la vista sea coherente.
 */
export async function settleClockIfExpired(
  clock: RrhhClockRecord,
  now: Date,
  cfg: { jornadaStartHour: number; timezone: string },
): Promise<RrhhClockRecord> {
  if (clock.clockOutAt) return clock;
  const end = jornadaEndUtc(clock.jornadaDate, cfg.jornadaStartHour, cfg.timezone);
  if (now.getTime() < end.getTime()) return clock;

  const clockOutAt = end.toISOString();
  try {
    return await closeClockOut({
      userId: clock.userId,
      clockInAt: clock.clockInAt,
      clockId: clock.clockId,
      clockOutAt,
      autoClosed: true,
    });
  } catch {
    return { ...clock, clockOutAt, autoClosed: true, updatedAt: clockOutAt };
  }
}
